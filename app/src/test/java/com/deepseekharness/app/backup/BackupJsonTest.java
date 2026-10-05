package com.deepseekharness.app.backup;

import org.junit.Test;
import java.io.IOException;
import java.util.*;
import static org.junit.Assert.*;

public class BackupJsonTest {
  @Test
  public void signedRecipeBudgetAcceptsLargePatchButArchiveBudgetStillRejectsIt() throws Exception {
    String patch = "x".repeat(58831);
    byte[] json = ("{\"patches\":[{\"after\":\"" + patch + "\"}]}").getBytes(java.nio.charset.StandardCharsets.UTF_8);
    assertThrows(IOException.class, () -> BackupJson.read(json, BackupLimits.MANIFEST));
    assertNotNull(BackupJson.read(json, BackupLimits.MANIFEST, BackupLimits.MANIFEST).get("patches"));
    assertThrows(IOException.class, () -> BackupJson.read(json, json.length - 1, json.length - 1));
    assertThrows(IOException.class, () -> BackupJson.read("{\"a\":1,\"a\":2}".getBytes(), 100, 100));
  }

  @Test
  public void serializerBoundsActualUtf8BytesAndRoundTrips() throws Exception {
    var value = Map.of("text", "备份😀");
    byte[] encoded = BackupJson.write(value, 256);
    assertEquals(value, BackupJson.read(encoded, 256));
    assertThrows(IOException.class, () -> BackupJson.write(value, encoded.length - 1));
  }

  @Test
  public void serializerStopsAnUnboundedIterable() {
    Iterable<String> infinite =
        () ->
            new Iterator<>() {
              public boolean hasNext() {
                return true;
              }

              public String next() {
                return "entry";
              }
            };
    assertThrows(IOException.class, () -> BackupJson.write(Map.of("rows", infinite), 8192));
  }

  @Test
  public void duplicatedKeysAndOversizedStringsDoNotRoundTripAsValidMetadata() {
    assertThrows(
        IOException.class,
        () ->
            BackupJson.read(
                "{\"a\":1,\"a\":2}".getBytes(java.nio.charset.StandardCharsets.UTF_8), 100));
    assertThrows(
        IOException.class,
        () ->
            BackupJson.write(
                Map.of("a", "x".repeat(BackupLimits.RECORD + 1)), BackupLimits.MANIFEST));
  }
}
