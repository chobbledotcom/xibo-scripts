// Auto-remove flash messages after animation
document.addEventListener('DOMContentLoaded', () => {
  const removeFlash = (element) => {
    if (element) {
      setTimeout(() => {
        element.remove();
      }, 3000);
    }
  };

  document.querySelectorAll('.flash-notice, .flash-error').forEach(removeFlash);

  // Handle Turbo stream updates
  document.addEventListener('turbo:before-stream-render', (event) => {
    if (event.target.target === 'flash') {
      setTimeout(() => {
        document.querySelectorAll('.flash-notice, .flash-error').forEach(removeFlash);
      }, 10);
    }
  });
});
