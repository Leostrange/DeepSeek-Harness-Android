package com.deepseekharness.app.util;

import com.google.gson.Gson;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Bounded terminal transcripts; reopening an entry always starts a new shell. */
public final class TerminalHistory {
  public static final int MAX_ENTRIES = 40;
  public static final int MAX_TRANSCRIPT = 65536;
  private final ArrayList<Entry> entries = new ArrayList<>();

  public static final class Entry {
    public String id, title, workingDirectory, transcript;
    public long startedAt, endedAt, lastSeenAt;
    private Entry() {}
    Entry(String id, String title, String directory, long start, long end, long seen, String text) {
      this.id = id; this.title = title; workingDirectory = directory;
      startedAt = start; endedAt = end; lastSeenAt = seen; transcript = text;
    }
    Entry copy() { return new Entry(id, title, workingDirectory, startedAt, endedAt, lastSeenAt, transcript); }
  }

  public synchronized String begin(String title, String directory, long now) {
    String id = UUID.randomUUID().toString();
    entries.add(0, new Entry(id, cleanTitle(title), directory, now, 0, now, ""));
    trim();
    return id;
  }

  public synchronized void snapshot(String id, String transcript, boolean ended, long now) {
    Entry e = find(id);
    if (e == null) return;
    String text = transcript == null ? "" : transcript;
    e.transcript = text.substring(Math.max(0, text.length() - MAX_TRANSCRIPT));
    e.lastSeenAt = now;
    if (ended && e.endedAt == 0) e.endedAt = now;
  }

  public synchronized void rename(String id, String title) {
    Entry e = find(id);
    if (e != null) e.title = cleanTitle(title);
  }

  public synchronized void forget(String id) { entries.removeIf(e -> e.id.equals(id)); }
  public synchronized void clearEnded() { entries.removeIf(e -> e.endedAt != 0); }
  public synchronized List<Entry> entries() {
    List<Entry> copy = new ArrayList<>();
    for (Entry e : entries) copy.add(e.copy());
    return copy;
  }
  public synchronized Entry get(String id) { Entry e = find(id); return e == null ? null : e.copy(); }
  public synchronized String json() { return new Gson().toJson(entries); }

  public static TerminalHistory restore(String json) {
    TerminalHistory history = new TerminalHistory();
    if (json == null || json.length() > 4 * 1024 * 1024) return history;
    try {
      Entry[] rows = new Gson().fromJson(json, Entry[].class);
      if (rows == null) return history;
      for (Entry row : rows) {
        if (row == null || row.id == null || row.title == null || row.workingDirectory == null
            || row.transcript == null || row.startedAt < 0 || history.find(row.id) != null) continue;
        UUID.fromString(row.id);
        if (!row.workingDirectory.startsWith("/") || row.workingDirectory.indexOf('\0') >= 0) continue;
        row.title = cleanTitle(row.title);
        row.transcript = row.transcript.substring(Math.max(0, row.transcript.length() - MAX_TRANSCRIPT));
        // A prior process cannot have a live shell in this new process.
        if (row.endedAt == 0) row.endedAt = Math.max(row.startedAt, row.lastSeenAt);
        history.entries.add(row);
        if (history.entries.size() == MAX_ENTRIES) break;
      }
    } catch (RuntimeException ignored) { /* Invalid preferences do not block terminal startup. */ }
    return history;
  }

  private Entry find(String id) { for (Entry e : entries) if (e.id.equals(id)) return e; return null; }
  private void trim() { while (entries.size() > MAX_ENTRIES) entries.remove(entries.size() - 1); }
  private static String cleanTitle(String title) {
    String text = title == null ? "" : title.strip().replace('\n', ' ').replace('\r', ' ');
    return text.substring(0, Math.min(80, text.length()));
  }
}
