package com.deepseekharness.app.util;

/** 独立俄文候选的身份；不读取或清理历史 Alpha 命名空间。 */
public final class AppIdentity {
    private AppIdentity() { }
    public static final String APPLICATION_ID = "com.dsh.client.ru020";
    public static final String PUBLIC_DATA_FOLDER = "dshdata-ru020";
    public static final String PUBLIC_DATA_PATH = "Documents/" + PUBLIC_DATA_FOLDER;
    public static final int WEB_PORT = 3480;
    public static final int LAN_PORT = 3481;
    public static final int BRIDGE_PORT = 3490;
}
