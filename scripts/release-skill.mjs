import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SkillRegistry from '@deepseek-ai/dsh-skill';
import { apply as applySkillTool } from '@deepseek-ai/dsh-tool-skill';

// Use the real host registry and tool; no server, profile or credentials are needed.
export async function verifyRegisteredSkill(skill) {
  const ctx = new Context();
  try {
    await ctx.plugin(SkillRegistry);
    ctx.skills.register(skill);
    const loaded = await ctx.skills.get('openui');
    assert.equal(loaded.name, skill.name);
    assert.equal(loaded.source, 'bundled');
    assert.equal(loaded.content, skill.content);
    assert.equal(loaded.path, skill.path);
    let tool;
    applySkillTool({
      skills: ctx.skills,
      tools: { register(value) { tool = value; } },
      on() { return () => {}; },
      workingDirectory: { async ensure() { throw new Error('Skill smoke must not access a workspace'); } },
    });
    assert.equal(tool.name, 'skill');
    const result = await tool.execute({ name: 'openui' }, {});
    assert.equal(result.name, 'openui');
    assert.equal(result.content, skill.content);
    assert.equal(result.provider, loaded.provider);
    const rendered = tool.output.render({ name: 'openui' }, result);
    assert.match(rendered[0].text, /<skill_content name="openui">/);
    assert.ok(rendered[0].text.includes(skill.content));
    return result;
  } finally {
    await ctx.fiber.dispose();
  }
}
