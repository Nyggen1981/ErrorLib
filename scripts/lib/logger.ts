const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

function timestamp() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

export const log = {
  step(icon: string, message: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${icon}  ${COLORS.bold}${message}${COLORS.reset}`
    );
  },
  info(message: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset}     ${COLORS.cyan}${message}${COLORS.reset}`
    );
  },
  success(message: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset}     ${COLORS.green}${message}${COLORS.reset}`
    );
  },
  warn(message: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset}     ${COLORS.yellow}${message}${COLORS.reset}`
    );
  },
  error(message: string) {
    console.error(
      `${COLORS.gray}${timestamp()}${COLORS.reset}     ${COLORS.red}${message}${COLORS.reset}`
    );
  },
  detail(message: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset}     ${COLORS.dim}${message}${COLORS.reset}`
    );
  },
  banner(title: string) {
    const line = "─".repeat(50);
    console.log(`\n${COLORS.magenta}${line}${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.magenta}  ⛏  ${title}${COLORS.reset}`);
    console.log(`${COLORS.magenta}${line}${COLORS.reset}\n`);
  },
};
