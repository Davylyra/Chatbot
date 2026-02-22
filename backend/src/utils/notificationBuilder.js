/**
 * Central notification builder
 */
export function buildNotification({
  title,
  message,
  type = 'info',
  category = 'general',
  priority = 'normal',
  metadata = {},
  actionUrl = null,
  link = null,
  linkText = 'View Details',
  expiresInDays = null,
  expiresAt = null,
  fetchedAt = null,
  readNowUrl = null,
  sourceUniversity = null
} = {}) {
  const createdAt = new Date();

  if (!expiresAt && expiresInDays) {
    expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  }

  return {
    title,
    message,
    type,
    category,
    priority,
    actionUrl,
    link,
    linkText,
    metadata: {
      ...metadata,
      universityName: sourceUniversity || metadata?.universityName,
    },
    createdAt,
    isRead: false,
    readAt: null,
    expiresAt: expiresAt || null,
    fetchedAt: fetchedAt || createdAt,
    readNowUrl: readNowUrl || link || actionUrl, // URL for "Read now" button
    readNowExpiresAt: null // Will be set 24 hours after first read
  };
}

export default { buildNotification };
