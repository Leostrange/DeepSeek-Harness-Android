package com.deepseekharness.app.util;

import org.junit.Test;
import static org.junit.Assert.*;

public class TerminalHistoryTest {
  @Test public void cappedHistoryRestoresTranscriptsAndNamesWithoutPretendingShellsAreLive() {
    TerminalHistory history = new TerminalHistory();
    for (int i = 0; i < 45; i++) {
      String id = history.begin("shell " + i, "/root", i + 1);
      history.snapshot(id, "x".repeat(70000) + "tail", false, i + 100);
    }
    assertEquals(40, history.entries().size());
    String id = history.entries().get(0).id;
    history.rename(id, " Build\nserver ");
    TerminalHistory restored = TerminalHistory.restore(history.json());
    var entry = restored.get(id);
    assertEquals("Build server", entry.title);
    assertEquals(65536, entry.transcript.length());
    assertTrue(entry.transcript.endsWith("tail"));
    assertTrue(entry.endedAt > 0);
    restored.forget(id);
    assertNull(restored.get(id));
    restored.clearEnded();
    assertTrue(restored.entries().isEmpty());
  }
  @Test public void invalidPersistenceDoesNotPreventNewShellsAndClearRetainsLiveEntries() {
    assertTrue(TerminalHistory.restore("invalid").entries().isEmpty());
    assertTrue(TerminalHistory.restore("null").entries().isEmpty());
    TerminalHistory history = new TerminalHistory();
    String live = history.begin("live", "/root", 1);
    String ended = history.begin("ended", "/root", 2);
    history.snapshot(ended, "done", true, 3);
    history.clearEnded();
    assertNotNull(history.get(live));
    assertNull(history.get(ended));
  }
}
