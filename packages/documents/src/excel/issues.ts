export type IssueLevel = 'error' | 'warning';

export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
  where?: string;
}

export const err = (code: string, message: string, where?: string): Issue =>
  where === undefined ? { level: 'error', code, message } : { level: 'error', code, message, where };

export const warn = (code: string, message: string, where?: string): Issue =>
  where === undefined ? { level: 'warning', code, message } : { level: 'warning', code, message, where };
