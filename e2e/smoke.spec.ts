import { registerGroup } from './register'

for (const group of ['display', 'create', 'delete', 'conflicts', 'a11y', 'extra']) {
  await registerGroup(group, true)
}
