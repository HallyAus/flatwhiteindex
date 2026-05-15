/**
 * Escape JSON for safe inlining inside a <script> tag. Prevents </script>
 * breakout, ampersand-entity issues, and U+2028 / U+2029 line-terminator XSS.
 */
export function jsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/ /g, "\\u2028")
    .replace(/ /g, "\\u2029");
}
