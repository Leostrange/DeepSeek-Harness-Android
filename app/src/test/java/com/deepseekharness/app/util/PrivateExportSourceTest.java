package com.deepseekharness.app.util;

import com.deepseekharness.app.backup.JvmBackupFileSystem;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import org.junit.Test;
import static org.junit.Assert.*;

public class PrivateExportSourceTest {
  @Test
  public void resolvesCacheAndFilesButRejectsTraversalAndOutsideFiles() throws Exception {
    File data = Files.createTempDirectory("export-source").toFile();
    File files = new File(data, "files"), cache = new File(data, "cache");
    assertTrue(files.mkdir());
    assertTrue(cache.mkdir());
    File log = new File(cache, "log.txt");
    Files.writeString(log.toPath(), "log");
    var fs = new JvmBackupFileSystem(data);
    assertEquals(log, PrivateExportSource.resolve(fs, data, files, cache, log));
    File saved = new File(files, "saved.txt");
    Files.writeString(saved.toPath(), "saved");
    assertEquals(saved, PrivateExportSource.resolve(fs, data, files, cache, saved));
    assertThrows(IOException.class, () -> PrivateExportSource.resolve(fs, data, files, cache, new File(cache, "../files/saved.txt")));
    assertThrows(IOException.class, () -> PrivateExportSource.resolve(fs, data, files, cache, new File(data, "other.txt")));
    var rejecting = new JvmBackupFileSystem(data) {
      @Override public Node stat(File file) throws IOException {
        if (file.equals(cache)) return new Node("LINK", "link", 0, 0, 0, 0);
        return super.stat(file);
      }
    };
    assertThrows(IOException.class, () -> PrivateExportSource.resolve(rejecting, data, files, cache, log));
  }
}
