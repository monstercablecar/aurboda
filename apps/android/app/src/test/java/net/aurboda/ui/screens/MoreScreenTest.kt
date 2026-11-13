package net.aurboda.ui.screens

import net.aurboda.MoreDestination
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MoreScreenTest {

    private val allItems = moreGroups.flatMap { it.items }
    private val webPaths = allItems.mapNotNull { (it.destination as? MoreDestination.Web)?.path }

    @Test
    fun `every web path is absolute and non-empty`() {
        assertTrue(webPaths.isNotEmpty())
        webPaths.forEach { path ->
            assertTrue("path should start with '/': $path", path.startsWith("/"))
            assertTrue("path should have a segment: $path", path.length > 1)
        }
    }

    @Test
    fun `web paths are unique`() {
        assertEquals(webPaths.size, webPaths.toSet().size)
    }

    @Test
    fun `item labels are unique`() {
        val labels = allItems.map { it.label }
        assertEquals(labels.size, labels.toSet().size)
    }

    @Test
    fun `native Live and Account destinations are present exactly once`() {
        assertEquals(1, allItems.count { it.destination == MoreDestination.Live })
        assertEquals(1, allItems.count { it.destination == MoreDestination.Account })
    }

    @Test
    fun `Mental assessments opens the embedded web route`() {
        assertEquals(MoreDestination.Web("/assessments"), allItems.single { it.label == "Mental assessments" }.destination)
    }

    @Test
    fun `PEOPLE opens the embedded web route`() {
        assertEquals(MoreDestination.Web("/people"), allItems.single { it.label == "PEOPLE" }.destination)
        assertEquals("https://example.com/people?embed=1", embeddedPageUrl("https://example.com", "/people"))
    }

    @Test
    fun `Work opens the embedded web route`() {
        assertEquals(MoreDestination.Web("/work"), allItems.single { it.label == "Work" }.destination)
    }

    @Test
    fun `CPAP opens the embedded web route`() {
        assertEquals(MoreDestination.Web("/cpap"), allItems.single { it.label == "CPAP" }.destination)
    }

    @Test
    fun `Simple food opens the embedded web route`() {
        assertEquals(MoreDestination.Web("/simple-food"), allItems.single { it.label == "Simple food" }.destination)
    }

    @Test
    fun `Treatments is in Log and opens the embedded web route`() {
        val log = moreGroups.single { it.header == "Log" }
        val treatments = log.items.single { it.label == "Treatments" }

        assertEquals(MoreDestination.Web("/treatments"), treatments.destination)
        assertEquals(
            "https://example.com/treatments?embed=1",
            embeddedPageUrl("https://example.com", (treatments.destination as MoreDestination.Web).path),
        )
    }
}
