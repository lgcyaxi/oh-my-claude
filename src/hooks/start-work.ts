/**
 * Start Work Hook
 *
 * A Stop hook that checks for active work plans and provides context.
 * When there's an active boulder.json, reminds about ongoing work.
 */

import { existsSync, readFileSync, statSync, readdirSync } from "node:fs"
import { join, basename } from "node:path"

interface BoulderState {
  active_plan: string
  started_at: string
  session_ids: string[]
  plan_name: string
}

interface PlanProgress {
  total: number
  completed: number
  isComplete: boolean
}

const BOULDER_DIR = ".sisyphus"
const BOULDER_FILE = "boulder.json"
const PROMETHEUS_PLANS_DIR = ".sisyphus/plans"

function getBoulderFilePath(directory: string): string {
  return join(directory, BOULDER_DIR, BOULDER_FILE)
}

function readBoulderState(directory: string): BoulderState | null {
  const filePath = getBoulderFilePath(directory)

  if (!existsSync(filePath)) {
    return null
  }

  try {
    const content = readFileSync(filePath, "utf-8")
    return JSON.parse(content) as BoulderState
  } catch {
    return null
  }
}

function getPlanProgress(planPath: string): PlanProgress {
  if (!existsSync(planPath)) {
    return { total: 0, completed: 0, isComplete: true }
  }

  try {
    const content = readFileSync(planPath, "utf-8")
    const uncheckedMatches = content.match(/^[-*]\s*\[\s*\]/gm) || []
    const checkedMatches = content.match(/^[-*]\s*\[[xX]\]/gm) || []

    const total = uncheckedMatches.length + checkedMatches.length
    const completed = checkedMatches.length

    return {
      total,
      completed,
      isComplete: total === 0 || completed === total,
    }
  } catch {
    return { total: 0, completed: 0, isComplete: true }
  }
}

function findPrometheusPlans(directory: string): string[] {
  const plansDir = join(directory, PROMETHEUS_PLANS_DIR)

  if (!existsSync(plansDir)) {
    return []
  }

  try {
    const files = readdirSync(plansDir)
    return files
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(plansDir, f))
      .sort((a, b) => {
        const aStat = statSync(a)
        const bStat = statSync(b)
        return bStat.mtimeMs - aStat.mtimeMs
      })
  } catch {
    return []
  }
}

function getPlanName(planPath: string): string {
  return basename(planPath, ".md")
}

async function main() {
  // Read input from stdin
  let input = ""
  for await (const chunk of process.stdin) {
    input += chunk
  }

  const data = JSON.parse(input)
  const cwd = process.cwd()

  // Check for active boulder state
  const boulderState = readBoulderState(cwd)

  if (boulderState) {
    const progress = getPlanProgress(boulderState.active_plan)

    if (!progress.isComplete) {
      // There's active work - provide context
      const output = {
        result: "continue",
        message: `

---
## Active Work Session

**Plan**: ${boulderState.plan_name}
**Path**: ${boulderState.active_plan}
**Progress**: ${progress.completed}/${progress.total} tasks completed
**Sessions**: ${boulderState.session_ids.length}

To continue work, run: /omc-start-work
---
`,
      }
      console.log(JSON.stringify(output))
      return
    }
  }

  // Check for available plans
  const plans = findPrometheusPlans(cwd)
  const incompletePlans = plans.filter((p) => !getPlanProgress(p).isComplete)

  if (incompletePlans.length > 0) {
    const planList = incompletePlans
      .map((p) => {
        const prog = getPlanProgress(p)
        return `- ${getPlanName(p)}: ${prog.completed}/${prog.total} tasks`
      })
      .join("\n")

    const output = {
      result: "continue",
      message: `

---
## Available Work Plans

${planList}

To start working on a plan, run: /omc-start-work [plan-name]
---
`,
    }
    console.log(JSON.stringify(output))
    return
  }

  // No active work or plans
  console.log(JSON.stringify({ result: "continue" }))
}

main().catch((error) => {
  console.error("Start-work hook error:", error)
  console.log(JSON.stringify({ result: "continue" }))
})
