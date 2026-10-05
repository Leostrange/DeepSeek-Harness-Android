package com.deepseekharness.app.util;
import org.junit.Test;
import static org.junit.Assert.*;
public class AppIdentityTest {
    @Test public void candidateCannotShareAlphaNamespace() {
        assertNotEquals("com.dsh.client", AppIdentity.APPLICATION_ID);
        assertNotEquals("dshdata", AppIdentity.PUBLIC_DATA_FOLDER);
        assertEquals("Documents/dshdata-rc2ru", AppIdentity.PUBLIC_DATA_PATH);
        assertFalse(AppIdentity.PUBLIC_DATA_FOLDER.contains("/"));
        assertFalse(AppIdentity.PUBLIC_DATA_FOLDER.contains(".."));
        assertEquals(3380, Constants.DSH_WEB_PORT);
        assertEquals(3381, Constants.LAN_BRIDGE_PORT);
        assertEquals(3390, Constants.SHELL_BRIDGE_PORT);
        assertTrue(WebPortPolicy.reserved(Constants.LAN_BRIDGE_PORT));
        assertTrue(WebPortPolicy.reserved(Constants.SHELL_BRIDGE_PORT));
        assertFalse(WebPortPolicy.reserved(Constants.DSH_WEB_PORT));
    }
}
