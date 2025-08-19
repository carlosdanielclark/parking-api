export interface LogDetails {
  [key: string]: any;
}

export interface LogContext {
  [key: string]: any;
}

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export enum LogAction {
  LOGIN = 'login',
  LOGOUT = 'logout',
  REGISTER = 'register',
  CREATE_RESERVATION = 'create_reservation',
  CANCEL_RESERVATION = 'cancel_reservation',
  UPDATE_USER = 'update_user',
  ROLE_CHANGE = 'role_change',
  CREATE_PLAZA = 'create_plaza',
  UPDATE_PLAZA = 'update_plaza',
  DELETE_PLAZA = 'delete_plaza',
  ACCESS_LOGS = 'access_logs',
  SYSTEM_ERROR = 'system_error',
}
