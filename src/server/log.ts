import { IS_PRODUCTION } from './config';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const threshold = IS_PRODUCTION ? LEVELS.info : LEVELS.debug;

function emit(level: Level, name: string, fields: unknown) {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    name,
    ...(typeof fields === 'object' && fields !== null
      ? (fields as Record<string, unknown>)
      : { message: fields })
  });
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

/**
 * Structured single-line JSON, which is what the previous mozlog `heka`
 * formatter produced for log aggregators.
 */
export function createLogger(name: string) {
  return {
    debug: (fields: unknown) => emit('debug', name, fields),
    info: (fields: unknown) => emit('info', name, fields),
    warn: (fields: unknown) => emit('warn', name, fields),
    error: (fields: unknown) => emit('error', name, fields)
  };
}

export type Logger = ReturnType<typeof createLogger>;

export default createLogger;
