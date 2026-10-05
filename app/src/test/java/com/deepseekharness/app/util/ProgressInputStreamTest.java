package com.deepseekharness.app.util;
import org.junit.Test;
import java.io.*;
import java.util.*;
import static org.junit.Assert.*;
public class ProgressInputStreamTest {
    @Test public void byteBulkAndSkipReportActualBytesWithoutDoubleCounting() throws Exception {
        List<Long> done = new ArrayList<>();
        try (var input = new ProgressInputStream(new ByteArrayInputStream(new byte[10]), 10,
                (value,total)->{done.add(value);assertEquals(10L,total.longValue());})) {
            assertEquals(0,input.read());
            assertEquals(3,input.read(new byte[3]));
            assertEquals(2,input.skip(2));
            assertEquals(4,input.read(new byte[20]));
            assertEquals(-1,input.read());
            assertEquals(-1,input.read(new byte[3]));
        }
        assertEquals(Arrays.asList(1L,4L,6L,10L),done);
    }
    @Test public void archivesResetIndependentlyAndUnknownTotalIsPreserved() throws Exception {
        List<String> events = new ArrayList<>();
        for (long total : new long[]{3,-1}) {
            try (var input = new ProgressInputStream(new ByteArrayInputStream(new byte[3]),total,
                    (value,size)->events.add(value+"/"+size))) { assertEquals(3,input.readAllBytes().length); }
        }
        assertEquals(Arrays.asList("3/3","3/-1"),events);
    }
}
