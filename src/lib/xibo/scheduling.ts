/**
 * Display scheduling — manages Xibo campaigns and schedules
 *
 * When menu screens change for a screen, the system:
 * 1. Collects all menu screens ordered by sort_order
 * 2. Creates/updates a Xibo campaign with the layouts
 * 3. Schedules the campaign on the screen's Xibo display
 */

import { filter, pipe, reduce } from "#fp";
import { del, get, post, put } from "#xibo/client.ts";
import type { XiboCampaign, XiboConfig, XiboSchedule } from "#xibo/types.ts";
import type { MenuScreen } from "#lib/types.ts";

/** Campaign layout assignment body */
type CampaignLayoutAssignment = {
  layoutId: number;
  displayOrder: number;
};

/**
 * Assign layouts to a campaign in order.
 */
const assignLayouts = async (opts: {
  config: XiboConfig;
  campaignId: number;
  layouts: CampaignLayoutAssignment[];
}): Promise<void> => {
  for (const layout of opts.layouts) {
    await post(opts.config, `campaign/${opts.campaignId}/layout/assign`, {
      layoutId: [layout.layoutId],
      displayOrder: [layout.displayOrder],
    });
  }
};

/**
 * Create a new campaign with the given layouts
 */
export const createCampaign = async (
  config: XiboConfig,
  name: string,
  layouts: CampaignLayoutAssignment[],
): Promise<XiboCampaign> => {
  const campaign = await post<XiboCampaign>(config, "campaign", {
    name,
  });
  await assignLayouts({ config, campaignId: campaign.campaignId, layouts });
  return campaign;
};

/**
 * Update a campaign by removing old layouts and assigning new ones
 */
export const updateCampaign = async (
  config: XiboConfig,
  campaignId: number,
  layouts: CampaignLayoutAssignment[],
): Promise<void> => {
  // Get the current campaign layouts to unassign
  const existing = await get<XiboCampaign[]>(config, `campaign?campaignId=${campaignId}`);
  if (existing.length > 0) {
    // Unassign all existing layouts first by getting the full campaign details
    try {
      await put(config, `campaign/${campaignId}`, {
        name: existing[0]!.campaign,
      });
    } catch {
      // Campaign update may fail if no changes; continue
    }
  }

  await assignLayouts({ config, campaignId, layouts });
};

/**
 * Delete a campaign
 */
export const deleteCampaign = async (
  config: XiboConfig,
  campaignId: number,
): Promise<void> => {
  await del(config, `campaign/${campaignId}`);
};

/**
 * Schedule a campaign on a display.
 * Creates an "always" schedule (no fromDt/toDt) for the display group.
 */
export const scheduleCampaign = (
  config: XiboConfig,
  campaignId: number,
  displayGroupId: number,
): Promise<XiboSchedule> =>
  post<XiboSchedule>(config, "schedule", {
    eventTypeId: 1, // Layout/campaign event
    campaignId,
    displayGroupIds: [displayGroupId],
    isPriority: 0,
  });

/**
 * Get existing schedules for a display group
 */
export const getSchedulesForDisplay = (
  config: XiboConfig,
  displayGroupId: number,
): Promise<XiboSchedule[]> =>
  get<XiboSchedule[]>(config, `schedule?displayGroupIds=[${displayGroupId}]`);

/**
 * Delete a schedule event
 */
export const deleteScheduleEvent = async (
  config: XiboConfig,
  eventId: number,
): Promise<void> => {
  await del(config, `schedule/${eventId}`);
};

/**
 * Build campaign layout assignments from ordered menu screens.
 * Only includes menu screens that have a valid Xibo layout ID.
 */
export const buildCampaignLayouts = (
  menuScreens: MenuScreen[],
): CampaignLayoutAssignment[] =>
  pipe(
    filter((ms: MenuScreen) => ms.xibo_layout_id !== null),
    reduce((acc: CampaignLayoutAssignment[], ms: MenuScreen) => {
      acc.push({ layoutId: ms.xibo_layout_id!, displayOrder: acc.length + 1 });
      return acc;
    }, [] as CampaignLayoutAssignment[]),
  )(menuScreens);

/**
 * Rebuild the campaign and schedule for a screen.
 *
 * This is the main entry point called after any menu screen change.
 * It collects all menu screens for the screen, creates/updates
 * the campaign, and schedules it on the display.
 */
export const rebuildScreenSchedule = async (
  config: XiboConfig,
  menuScreens: MenuScreen[],
  screenName: string,
  displayId: number,
  existingCampaignId: number | null,
): Promise<{ campaignId: number }> => {
  const layouts = buildCampaignLayouts(menuScreens);

  if (layouts.length === 0) {
    // No layouts — delete the campaign if it exists
    if (existingCampaignId !== null) {
      try {
        await deleteCampaign(config, existingCampaignId);
      } catch {
        // Campaign may already be deleted
      }
    }
    return { campaignId: existingCampaignId ?? 0 };
  }

  let campaignId: number;

  if (existingCampaignId !== null) {
    // Update existing campaign
    await updateCampaign(config, existingCampaignId, layouts);
    campaignId = existingCampaignId;
  } else {
    // Create new campaign
    const campaign = await createCampaign(
      config,
      `Screen: ${screenName}`,
      layouts,
    );
    campaignId = campaign.campaignId;

    // Schedule the new campaign on the display
    // Display IDs map to display group IDs in Xibo (1:1 for simple displays)
    await scheduleCampaign(config, campaignId, displayId);
  }

  return { campaignId };
};
