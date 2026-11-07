// Catch-up onboarding for signed Discord interactions. Answers are published in #introductions, never logged.
const API = 'https://discord.com/api/v10';
const CHANNEL = '1550329955664011376';
const PREFIX = 'intro1';
const HEADER = "Tell us a little about yourself. Your four answers will be posted publicly in #introductions for the community to read. Don't include private information. Once submitted, you'll receive the Member role and can participate in the server.";
export const FIELDS = [
  { id: 'interest', label: "Why you're here", description: 'What brought you to SapinSapin AI, and what areas of AI interest you?', placeholder: "Tell us what interested you and what you'd like to explore...", style: 2, min: 5 },
  { id: 'tools', label: 'Tools you use', description: 'What AI tools, software, apps, or websites do you use or have experience with?', placeholder: 'e.g. ChatGPT, Claude, Gemini, Python, Figma, Notion, Discord, etc.', style: 2, min: 2 },
  { id: 'about-you', label: 'about you', description: "Tell us a little about yourself — your hobbies, work, skills, or things you'd like to learn.", placeholder: "e.g. I'm into design, coding, music, research, gaming, or learning new AI tools...", style: 2, min: 2 },
  { id: 'languages', label: 'Languages you speak', description: 'What languages do you speak or understand?', placeholder: 'e.g. Filipino, English, Cebuano, Ilocano, Hiligaynon', style: 1, min: 2 },
];
const privateReply = content => Response.json({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });
const token = env => env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN ?? env.BOT_TOKEN;
const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);

async function discord(env, path, method = 'GET', body, reason) {
  if (!token(env)) throw new Error('Bot authentication is not configured.');
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bot ${token(env)}`, 'Content-Type': 'application/json', ...(reason ? { 'X-Audit-Log-Reason': encodeURIComponent(reason) } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Discord ${method} failed (${response.status}).`);
  return response.status === 204 ? null : response.json();
}
async function finish(interaction, env, content) {
  // Do not log webhook tokens, submitted answers, or raw Discord response bodies.
  const response = await fetch(`${API}/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) console.error('Introduction reply failed:', response.status);
}
async function roles(env) {
  const list = await discord(env, `/guilds/${env.DISCORD_GUILD_ID}/roles`);
  const unique = name => {
    const matches = list.filter(role => role.name === name && !role.managed && role.id !== env.DISCORD_GUILD_ID);
    if (matches.length !== 1) throw new Error(`The ${name} role must exist exactly once.`);
    return matches[0];
  };
  const member = unique('Member');
  // Fail closed if the existing Member role has been turned into a privileged role.
  const critical = (1n << 3n) | (1n << 4n) | (1n << 5n) | (1n << 28n) | (1n << 29n) | (1n << 1n) | (1n << 2n);
  if (BigInt(member.permissions) & critical) throw new Error('Member has elevated permissions; ask an administrator to check its configuration.');
  return { mod: unique('mod'), member };
}
async function signature(payload, env) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`sappy-introduction:${env.DISCORD_GUILD_ID}:${payload}`)));
  return Array.from(bytes.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function makeCapability(target, env) {
  const expiry = Math.floor(Date.now() / 1000) + 14 * 86400;
  const nonce = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  const payload = `${target}.${expiry}.${nonce}`;
  return `${PREFIX}.${payload}.${await signature(payload, env)}`;
}
async function capability(id, interaction, env) {
  const parts = String(id).split('.');
  if (parts.length !== 5 || parts[0] !== PREFIX || !snowflake(parts[1]) || !/^\d{10}$/.test(parts[2]) || !/^[a-f0-9]{8}$/.test(parts[3]) || !/^[a-f0-9]{32}$/.test(parts[4])) return null;
  if (Number(parts[2]) < Date.now() / 1000 || Number(parts[2]) > Date.now() / 1000 + 14 * 86400 + 60) return null;
  const expected = await signature(parts.slice(1, 4).join('.'), env);
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ parts[4].charCodeAt(i);
  if (mismatch || parts[1] !== interaction.member?.user?.id) return null;
  return parts[1];
}
export function introductionModal(customId) {
  return { type: 9, data: { custom_id: customId, title: 'Complete Your Introduction', components: [
    { type: 10, content: HEADER },
    ...FIELDS.map(field => ({ type: 18, label: field.label, description: field.description, component: {
      type: 4, custom_id: field.id, style: field.style, placeholder: field.placeholder, required: true, min_length: field.min, max_length: 1000,
    } })),
  ] } };
}
function readAnswers(components) {
  const answers = new Map();
  const walk = component => {
    if (component.type === 4) {
      if (answers.has(component.custom_id)) throw new Error('Duplicate field.');
      answers.set(component.custom_id, component.value);
    }
    for (const child of component.components ?? []) walk(child);
    if (component.component) walk(component.component);
  };
  try { for (const component of components ?? []) walk(component); } catch { return null; }
  const valid = answers.size === FIELDS.length && FIELDS.every(field => {
    const value = answers.get(field.id);
    return typeof value === 'string' && value.trim().length >= field.min && value.length <= 1000;
  });
  return valid ? answers : null;
}
async function prompt(interaction, env) {
  const selected = interaction.data.options?.find(option => option.name === 'member' && option.type === 6)?.value;
  if (!snowflake(selected)) return 'Choose the missed member using the member option.';
  const configured = await roles(env);
  if (!interaction.member.roles?.includes(configured.mod.id)) return 'Only members with the mod role can run this command.';
  const member = await discord(env, `/guilds/${env.DISCORD_GUILD_ID}/members/${selected}`);
  if (member.user?.bot) return 'Choose a person, not a bot.';
  if (member.roles.includes(configured.member.id)) return 'That member already has Member. No introduction prompt was sent.';
  const id = await makeCapability(selected, env);
  await discord(env, `/channels/${CHANNEL}/messages`, 'POST', {
    content: `👋 Hey <@${selected}>, welcome to Sapin Sapin AI!\n\nWe're glad you're here. Before you can participate in the rest of the server, we'd love to get to know you a little.\n\nClick **Complete Introduction 💜** below and answer a few quick questions. Your answers will be posted publicly in **#introductions** for the community to read, so don't include private information. Once you've submitted your introduction, you'll receive the **Member** role and can start joining the conversation.\n\nYou can already look around the server while you do this. Don't overthink your answers—we're just interested in getting to know you. 💜`,
    allowed_mentions: { parse: [], users: [selected] },
    nonce: interaction.id, enforce_nonce: true,
    components: [{ type: 1, components: [{ type: 2, style: 1, custom_id: id, label: 'Complete Introduction 💜' }] }],
  });
  return `Introduction button posted in <#${CHANNEL}> for <@${selected}>. Only that member can use it. Member is granted only after they submit the form. The button expires in 14 days; rerun this command if needed.`;
}
async function submit(interaction, env, selected, answers) {
  const configured = await roles(env);
  const member = await discord(env, `/guilds/${env.DISCORD_GUILD_ID}/members/${selected}`);
  if (member.user?.bot) return 'Bots cannot complete introductions.';
  if (member.roles.includes(configured.member.id)) return 'You already have Member. Your introduction is complete.';
  await discord(env, `/guilds/${env.DISCORD_GUILD_ID}/members/${selected}/roles/${configured.member.id}`, 'PUT', undefined, 'Completed existing introduction form via moderator catch-up command.');
  const content = `Thanks, <@${selected}>! 💜\n\nYour introduction is complete, and you've received the **Member** role.\n\nYou can now participate in the rest of the server. Welcome to **SapinSapin AI**!`;
  try {
    await discord(env, `/channels/${CHANNEL}/messages`, 'POST', {
      content,
      embeds: [{ title: 'Community introduction', color: 0x9b7de3,
        fields: FIELDS.map(field => ({ name: field.label, value: answers.get(field.id).trim(), inline: false })),
      }],
      allowed_mentions: { parse: [], users: [selected] }, nonce: interaction.id, enforce_nonce: true,
    });
  } catch {
    return 'Member was assigned, but your introduction answers could not be posted. Please let a moderator know and share your introduction in #introductions.';
  }
  return "Your answers are posted in #introductions, and you've received Member. Welcome to SapinSapin AI! 💜";
}
function defer(interaction, env, ctx, action) {
  ctx.waitUntil((async () => {
    let content;
    try { content = await action(); }
    catch (error) {
      console.error('Introduction action failed:', error.message);
      content = 'The introduction could not be completed. Ask a moderator to check Sappy’s server permissions and role hierarchy, then try again.';
    }
    try { await finish(interaction, env, content); } catch { console.error('Introduction reply unavailable.'); }
  })());
  return Response.json({ type: 5, data: { flags: 64 } });
}
export async function handleIntroduction(interaction, env, ctx) {
  const isCommand = interaction.type === 2 && interaction.data?.name === 'restart-introduction';
  const isComponent = [3, 5].includes(interaction.type) && String(interaction.data?.custom_id).startsWith(`${PREFIX}.`);
  if (!isCommand && !isComponent) return null;
  if (interaction.application_id !== env.DISCORD_APPLICATION_ID || interaction.guild_id !== env.DISCORD_GUILD_ID || !interaction.member?.user?.id) return privateReply('Use this onboarding flow inside SapinSapin AI.');
  if (isCommand) return defer(interaction, env, ctx, () => prompt(interaction, env));
  if (interaction.channel_id !== CHANNEL) return privateReply('Use the introduction button in #introductions.');
  let selected;
  try { selected = await capability(interaction.data.custom_id, interaction, env); } catch { return privateReply('Onboarding is unavailable. Please ask a moderator.'); }
  if (!selected) return privateReply('This button is for the member mentioned above, or has expired. Ask a moderator for your own introduction prompt.');
  if (interaction.type === 3) return Response.json(introductionModal(interaction.data.custom_id));
  const answers = readAnswers(interaction.data.components);
  if (!answers) return privateReply('Please answer all four introduction questions within the allowed lengths, then submit again.');
  return defer(interaction, env, ctx, () => submit(interaction, env, selected, answers));
}
