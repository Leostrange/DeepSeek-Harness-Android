package com.deepseekharness.app.util;

import java.io.FilterInputStream;
import java.io.InputStream;
import java.io.IOException;
import java.util.function.BiConsumer;

/** 报告实际读取的归档字节；每个独立归档有自己的计数和总量。 */
public final class ProgressInputStream extends FilterInputStream {
    private final long total;
    private final BiConsumer<Long, Long> progress;
    private long done;
    public ProgressInputStream(InputStream input, long total, BiConsumer<Long, Long> progress) {
        super(input); this.total = total; this.progress = progress;
    }
    private void counted(long size) {
        if (size <= 0) return;
        done += size;
        if (progress != null) progress.accept(done, total);
    }
    @Override public int read() throws IOException {
        int result = in.read(); if (result >= 0) counted(1); return result;
    }
    @Override public int read(byte[] bytes, int offset, int length) throws IOException {
        int result = in.read(bytes, offset, length); counted(result); return result;
    }
    @Override public long skip(long length) throws IOException {
        long result = in.skip(length); counted(result); return result;
    }
    @Override public boolean markSupported() { return false; }
    @Override public void mark(int limit) { }
    @Override public void reset() throws IOException { throw new IOException("PROGRESS_STREAM_RESET"); }
}
