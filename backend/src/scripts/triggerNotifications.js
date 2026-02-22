// Manual trigger script - DISABLED to prevent server crashes
// Only run when executed directly, not when imported
if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/'))) {
  import('../utils/notificationTriggers.js').then(mod => {
    if (mod && mod.checkAdmissionUpdates) {
      mod.checkAdmissionUpdates().then(() => {
        console.log('✔️ checkAdmissionUpdates completed');
        process.exit(0);
      }).catch(err => {
        console.error('❌ checkAdmissionUpdates error:', err);
        process.exit(1);
      });
    } else {
      console.error('❌ notificationTriggers module missing checkAdmissionUpdates');
      process.exit(1);
    }
  }).catch(err => {
    console.error('❌ Failed to import notificationTriggers:', err);
    process.exit(1);
  });
}
