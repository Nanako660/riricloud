/** 提交信息校验：Conventional Commits，英文 type + 中文描述（规范见 docs/GIT_WORKFLOW.md §3） */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 标题行（含 type/scope）不超过 50 字符，中文按 1 字符计
    'header-max-length': [2, 'always', 50],
    // 中文描述不适用英文大小写规则
    'subject-case': [0],
    // type 与 scope 枚举与 GIT_WORKFLOW.md §3.2/§3.3 保持一致
    'type-enum': [2, 'always', ['feat', 'fix', 'docs', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']],
    'scope-enum': [2, 'always', ['web', 'server', 'agent', 'db', 'proto', 'docs', 'repo']]
  }
};
