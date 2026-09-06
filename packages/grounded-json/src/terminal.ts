/* eslint-disable no-control-regex -- terminal controls are this module's security boundary */
const OSC = /\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/gu;
const CSI = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/gu;
const ESCAPE_SEQUENCE = /\u001B[@-_]/gu;
const UNSAFE_CONTROLS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/gu;

/** Removes terminal control sequences and directionality controls from untrusted text. */
export function sanitizeTerminalText(value: string, maxLength = 4_096): string {
  return value
    .replace(OSC, '')
    .replace(CSI, '')
    .replace(ESCAPE_SEQUENCE, '')
    .replace(UNSAFE_CONTROLS, '')
    .replaceAll('\r', '')
    .slice(0, maxLength);
}
