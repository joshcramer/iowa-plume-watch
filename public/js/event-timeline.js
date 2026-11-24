{
  const filters = document.querySelector('#official-update-log .event-filters');
  const note = document.getElementById('event-view-note');
  const timeline = document.getElementById('event-timeline');
  if (filters && note && timeline) {
    const buttons = [...filters.querySelectorAll('button[data-events]')];
    const rows = [...timeline.children];
    function show(view) {
      let count = 0;
      for (const row of rows) {
        row.hidden = view === 'notable' && row.dataset.tier !== 'notable';
        if (!row.hidden) count++;
      }
      for (const button of buttons) {
        button.setAttribute('aria-pressed', String(button.dataset.events === view));
      }
      const kind = view === 'notable' ? 'notable' : 'reviewed';
      note.textContent = `${count} ${kind} ${count === 1 ? 'event' : 'events'}`;
    }
    for (const button of buttons) {
      button.addEventListener('click', () => show(button.dataset.events));
    }
    show('notable');
    filters.hidden = false;
  }
}
