/** Slack's four-color mark, for the Slack integration (landing, /slack and board settings). */
export function SlackLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 54 54" aria-hidden style={{ flex: 'none' }}>
      <path fill="#36C5F0" d="M19.7 0a5.4 5.4 0 1 0 0 10.8h5.4V5.4A5.4 5.4 0 0 0 19.7 0Zm0 14.4H5.4a5.4 5.4 0 1 0 0 10.8h14.3a5.4 5.4 0 1 0 0-10.8Z" />
      <path fill="#2EB67D" d="M54 19.8a5.4 5.4 0 1 0-10.8 0v5.4h5.4a5.4 5.4 0 0 0 5.4-5.4Zm-14.4 0V5.4a5.4 5.4 0 1 0-10.8 0v14.4a5.4 5.4 0 1 0 10.8 0Z" />
      <path fill="#ECB22E" d="M34.2 54a5.4 5.4 0 1 0 0-10.8h-5.4v5.4a5.4 5.4 0 0 0 5.4 5.4Zm0-14.4h14.4a5.4 5.4 0 1 0 0-10.8H34.2a5.4 5.4 0 1 0 0 10.8Z" />
      <path fill="#E01E5A" d="M0 34.2a5.4 5.4 0 1 0 10.8 0v-5.4H5.4A5.4 5.4 0 0 0 0 34.2Zm14.4 0v14.4a5.4 5.4 0 1 0 10.8 0V34.2a5.4 5.4 0 1 0-10.8 0Z" />
    </svg>
  );
}
