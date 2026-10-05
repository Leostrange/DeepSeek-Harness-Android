package com.deepseekharness.app.util;

/** 独立俄文候选的身份；不读取或清理历史 Alpha 命名空间。 */
public final class AppIdentity {
    private AppIdentity() { }
    public static final String APPLICATION_ID = "com.dsh.client.rc2ru";
    public static final String PUBLIC_DATA_FOLDER = "dshdata-rc2ru";
    public static final String PUBLIC_DATA_PATH = "Documents/" + PUBLIC_DATA_FOLDER;
    public static final int WEB_PORT = 3380;
    public static final int LAN_PORT = 3381;
    public static final int BRIDGE_PORT = 3390;
}
