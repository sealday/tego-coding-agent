export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked" | "needs_human";

export interface AcceptanceCriterion {
  id: string;
  description: string;
  steps: string[];
  weight?: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dependencies: string[];
  attempts: number;
  acceptanceCriteria: AcceptanceCriterion[];
  outputs?: string[];
  notes?: string;
}

export interface ProjectMetadata {
  name: string;
  version: string;
  createdAt: string;
}

export interface TaskStatistics {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  blocked: number;
  needsHuman: number;
}

export interface TaskList {
  project: ProjectMetadata;
  tasks: Task[];
  statistics: TaskStatistics;
}

export interface ProgressEntry {
  timestamp: string;
  taskId?: string;
  status: string;
  details: string;
}

export interface EvaluatorReport {
  reportId?: string;
  taskId?: string;
  attempt?: number;
  timestamp?: string;
  overallResult?: "pass" | "fail";
  summary: string;
  criteriaResults: Array<{
    criterionId: string;
    description: string;
    result: "pass" | "fail";
    details: string[];
  }>;
  totalWeightedScore: number;
  threshold: number;
  finalDecision: "pass" | "fail";
  feedbackForGenerator: string;
  evaluatorError?: boolean;
}

export interface InitCommandOptions {
  prd?: string;
  json?: string;
  text?: string;
  name?: string;
  mode?: "simple" | "full";
  docs?: string;
}

export interface RunCommandOptions {
  maxTasks?: string;
  maxTokens?: string;
  continue?: boolean;
}

export interface SyncCommandOptions {
  check?: boolean;
  fix?: boolean;
  docs?: string;
}
