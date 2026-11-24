{
  const filters = document.querySelector('#official-update-log .event-filters');
  const note = document.getElementById('event-view-note');
  const timeline = document.getElementById('event-timeline');
  const older = document.querySelector('#official-update-log .event-more');
  if (filters && note && timeline && older) {
    const pageSize = 6;
    const buttons = [...filters.querySelectorAll('button[data-events]')];
    const rows = [...timeline.children];
    let view = 'notable';
    let limit = pageSize;
    function render() {
      const matches = rows.filter(row => view === 'all' || row.dataset.tier === 'notable');
      const visible = new Set(matches.slice(0, limit));
      for (const row of rows) row.hidden = !visible.has(row);
      for (const button of buttons) {
        button.setAttribute('aria-pressed', String(button.dataset.events === view));
      }
      const kind = view === 'notable' ? 'notable' : 'reviewed';
      note.textContent = `Showing ${visible.size} of ${matches.length} ${kind} ${matches.length === 1 ? 'event' : 'events'}`;
      older.hidden = visible.size === matches.length;
      return matches;
    }
    for (const button of buttons) {
      button.addEventListener('click', () => {
        if (view === button.dataset.events) return;
        view = button.dataset.events;
        limit = pageSize;
        render();
      });
    }
    older.addEventListener('click', () => {
      const firstNew = limit;
      limit += pageSize;
      render()[firstNew]?.querySelector('h4')?.focus();
    });
    render();
    filters.hidden = false;
  }
}
