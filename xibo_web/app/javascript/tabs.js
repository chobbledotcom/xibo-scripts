// Update ARIA attributes based on URL hash
function updateTabState() {
  const hash = window.location.hash || '#tree';
  const tablist = document.querySelector('nav[role="tablist"]');
  
  if (!tablist) return;
  
  // Update all tabs
  tablist.querySelectorAll('a').forEach(link => {
    const isActive = link.getAttribute('href') === hash;
    link.setAttribute('aria-selected', isActive);
    link.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  
  // Update all panels
  document.querySelectorAll('section[role="tabpanel"]').forEach(panel => {
    const isActive = '#' + panel.id === hash;
    panel.setAttribute('aria-hidden', !isActive);
  });
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (!e.target.matches('nav[role="tablist"] a')) return;
  
  const tabs = Array.from(document.querySelectorAll('nav[role="tablist"] a'));
  const currentIndex = tabs.indexOf(e.target);
  let nextIndex;
  
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
  } else if (e.key === 'Home') {
    e.preventDefault();
    nextIndex = 0;
  } else if (e.key === 'End') {
    e.preventDefault();
    nextIndex = tabs.length - 1;
  }
  
  if (nextIndex !== undefined) {
    tabs[nextIndex].click();
    tabs[nextIndex].focus();
  }
});

// Initialize and listen for hash changes
window.addEventListener('hashchange', updateTabState);
window.addEventListener('DOMContentLoaded', updateTabState);
