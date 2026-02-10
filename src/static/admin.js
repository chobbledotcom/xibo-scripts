/**
 * Admin client-side JavaScript
 * Minimal JS for progressive enhancement
 */

// Auto-dismiss success messages after 5 seconds
document.querySelectorAll('.success').forEach(function(el) {
  setTimeout(function() {
    el.style.transition = 'opacity 0.5s';
    el.style.opacity = '0';
    setTimeout(function() { el.remove(); }, 500);
  }, 5000);
});
