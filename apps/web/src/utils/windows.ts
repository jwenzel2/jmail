const MESSAGE_WINDOW_FEATURES = [
  'popup=yes',
  'width=1100',
  'height=800',
  'resizable=yes',
  'scrollbars=yes',
].join(',');

export function openMessagePopup(url: string): void {
  const popup = window.open(url, 'jmail-message', MESSAGE_WINDOW_FEATURES);
  if (popup) popup.focus();
  else window.open(url, '_blank', 'noopener,noreferrer');
}
