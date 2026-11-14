import sqlite3

conn = sqlite3.connect('data/quotes.db')
conn.row_factory = sqlite3.Row

print('=== EPISODES ===')
for r in conn.execute('SELECT id, season, episode, title_en, title_zh FROM episodes ORDER BY id'):
    print(dict(r))

print('\n=== LINES ===')
rows = conn.execute(
    '''SELECT e.season, e.episode, l.seq, l.text_en, l.text_zh, l.speaker, l.start_ms
       FROM lines l JOIN episodes e ON e.id = l.episode_id
       ORDER BY e.season, e.episode, l.seq'''
).fetchall()
for r in rows:
    print('S{:02d}E{:02d} #{:04d} | {:12s} | {:60s} || {}'.format(
        r['season'], r['episode'], r['seq'],
        (r['speaker'] or '')[:12],
        (r['text_en'] or '')[:60],
        (r['text_zh'] or '')[:40],
    ))
print('TOTAL', len(rows))
conn.close()
