// Queue processor - ensures only one tab processes the queue at a time
class QueueProcessor {
  constructor() {
    this.channel = new BroadcastChannel('xibo_queue');
    this.isLeader = false;
    this.heartbeatInterval = null;
    this.processingInterval = null;
    this.HEARTBEAT_INTERVAL = 1000; // 1 second
    this.PROCESSING_INTERVAL = 500; // 500ms - check frequently
    this.LEADER_TIMEOUT = 3000; // 3 seconds
    this.lastQueueLength = 0;
    
    this.init();
  }
  
  init() {
    // Listen for messages from other tabs
    this.channel.addEventListener('message', (event) => {
      if (event.data.type === 'heartbeat') {
        this.handleHeartbeat(event.data);
      } else if (event.data.type === 'leader_claim') {
        this.handleLeaderClaim(event.data);
      }
    });
    
    // Try to become leader
    this.tryBecomeLeader();
    
    // Check leader status periodically
    setInterval(() => this.checkLeaderStatus(), this.HEARTBEAT_INTERVAL);
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => this.cleanup());
  }
  
  tryBecomeLeader() {
    const lastHeartbeat = localStorage.getItem('queue_processor_heartbeat');
    const now = Date.now();
    
    // If no heartbeat or it's stale, become leader
    if (!lastHeartbeat || (now - parseInt(lastHeartbeat)) > this.LEADER_TIMEOUT) {
      this.becomeLeader();
    }
  }
  
  becomeLeader() {
    if (this.isLeader) return;
    
    console.log('[Queue Processor] Becoming leader');
    this.isLeader = true;
    
    // Announce leadership
    this.channel.postMessage({ type: 'leader_claim', timestamp: Date.now() });
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Start processing queue
    this.startProcessing();
    
    // Update UI
    this.updateUI();
  }
  
  resignLeadership() {
    if (!this.isLeader) return;
    
    console.log('[Queue Processor] Resigning leadership');
    this.isLeader = false;
    
    this.stopHeartbeat();
    this.stopProcessing();
    this.updateUI();
  }
  
  startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      localStorage.setItem('queue_processor_heartbeat', now.toString());
      this.channel.postMessage({ type: 'heartbeat', timestamp: now });
    }, this.HEARTBEAT_INTERVAL);
  }
  
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  handleHeartbeat(data) {
    // If we're leader and someone else is sending heartbeats, resign
    if (this.isLeader && data.timestamp) {
      const ourLastHeartbeat = parseInt(localStorage.getItem('queue_processor_heartbeat') || '0');
      
      // If their heartbeat is newer, resign
      if (data.timestamp > ourLastHeartbeat) {
        this.resignLeadership();
      }
    }
  }
  
  handleLeaderClaim(data) {
    // Someone else claimed leadership, resign if we think we're leader
    if (this.isLeader) {
      this.resignLeadership();
    }
  }
  
  checkLeaderStatus() {
    if (!this.isLeader) {
      // Try to become leader if current leader is stale
      this.tryBecomeLeader();
    }
  }
  
  startProcessing() {
    this.stopProcessing();
    
    // Process immediately on start
    this.processNextUpdate();
    
    // Then check regularly
    this.processingInterval = setInterval(() => {
      this.processNextUpdate();
    }, this.PROCESSING_INTERVAL);
  }
  
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }
  
  async processNextUpdate() {
    if (!this.isLeader) return;
    
    try {
      const response = await fetch('/updates/process', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.processed) {
          console.log('[Queue Processor] Processed update:', result);
          
          // Fetch updated queue HTML
          await this.refreshQueue(result.success);
        }
      }
    } catch (error) {
      console.error('[Queue Processor] Error processing update:', error);
    }
  }
  
  async refreshQueue(wasSuccess) {
    try {
      const response = await fetch('/updates/queue', {
        headers: {
          'Accept': 'text/html'
        }
      });
      
      if (response.ok) {
        const html = await response.text();
        const queueContainer = document.getElementById('update-queue-container');
        
        if (queueContainer) {
          // If success and queue is now empty, show success briefly
          if (wasSuccess && html.trim() === '') {
            const queueEl = document.getElementById('update-queue');
            if (queueEl) {
              const firstPendingItem = queueEl.querySelector('li.pending');
              if (firstPendingItem) {
                firstPendingItem.classList.remove('pending');
                firstPendingItem.classList.add('completed');
                const statusEl = firstPendingItem.querySelector('.status');
                if (statusEl) {
                  statusEl.textContent = 'Success!';
                }
              }
              
              // Wait 2 seconds then remove the queue widget
              setTimeout(() => {
                queueContainer.innerHTML = html;
              }, 2000);
            }
          } else {
            // Update queue immediately
            queueContainer.innerHTML = html;
          }
        }
      }
    } catch (error) {
      console.error('[Queue Processor] Error refreshing queue:', error);
    }
  }
  
  updateUI() {
    const statusEl = document.getElementById('queue-processor-status');
    if (statusEl) {
      if (this.isLeader) {
        statusEl.textContent = '● Processing';
        statusEl.style.color = '#4CAF50';
      } else {
        statusEl.textContent = '○ Idle';
        statusEl.style.color = '#999';
      }
    }
  }
  
  cleanup() {
    this.resignLeadership();
    this.channel.close();
  }
}

// Initialize queue processor when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize if update queue exists on page
  if (document.getElementById('update-queue')) {
    window.queueProcessor = new QueueProcessor();
  }
});
