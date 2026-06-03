// EventHub Frontend - Shared API Client and Alpine.js Components
//
// Deployment Flow:
// 1. Run `sam deploy` to provision the stack (S3, CloudFront, API Gateway)
// 2. Run `scripts/deploy-frontend.sh [stack-name]` which:
//    a. Reads ApiUrl, FrontendBucketName, and FrontendDistributionId from stack outputs
//    b. Uses `sed` to replace the API_BASE_URL line below with the actual API Gateway URL
//    c. Syncs the frontend/ directory to the S3 bucket
//    d. Invalidates the CloudFront cache
// 3. For local development, leave API_BASE_URL as empty string — apiClient.baseUrl()
//    falls back to http://localhost:3000 automatically.
//
// IMPORTANT: Keep this line format exactly as-is — deploy-frontend.sh uses sed to inject the real URL.
// For local development, the empty string triggers fallback to http://localhost:3000.

const API_BASE_URL = 'https://7dl2uagpbh.execute-api.us-east-1.amazonaws.com';

// Status translation helper
function translateStatus(status) {
  const map = {
    'PENDING_DOCUMENT': 'Aguardando Documento',
    'DOCUMENT_UPLOADED': 'Documento Enviado',
    'APPROVED': 'Aprovado',
    'REJECTED': 'Rejeitado',
  };
  return map[status] || status;
}

const apiClient = {
  baseUrl() {
    let url = API_BASE_URL;
    if (!url || typeof url !== 'string') {
      url = 'http://localhost:3000';
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.warn('[EventHub] Invalid API_BASE_URL, falling back to default');
      url = 'http://localhost:3000';
    }
    return url.replace(/\/$/, '');
  },

  async request(method, path, body = null) {
    const url = `${this.baseUrl()}${path}`;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    let response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      if (err instanceof TypeError) {
        throw { status: 0, message: 'Connection error, check your network', data: null };
      }
      throw err;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      let message;
      if (response.status >= 500) {
        message = 'Server error, please try again later';
      } else {
        message = (data && data.message) ? data.message : 'Request error';
      }
      throw { status: response.status, message, data };
    }

    return data;
  },

  get(path) {
    return this.request('GET', path);
  },

  post(path, body) {
    return this.request('POST', path, body);
  },
};

document.addEventListener('alpine:init', () => {
  Alpine.store('notification', {
    message: null,
    type: 'error',
    timer: null,

    show(message, type = 'error') {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.message = message;
      this.type = type;
      this.timer = setTimeout(() => {
        this.dismiss();
      }, 8000);
    },

    dismiss() {
      this.message = null;
      this.type = 'error';
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    },
  });

  Alpine.data('eventsPage', () => ({
    events: [],
    loading: false,
    error: null,
    selectedEvent: null,
    showRegisterForm: false,
    registration: { name: '', email: '', eventId: '' },
    registrationResult: null,
    submitting: false,
    formErrors: {},
    uploadFile: null,
    uploading: false,
    uploadProgress: 0,
    uploadError: null,
    uploadSuccess: false,
    // Status check by registration ID (from URL or manual input)
    statusCheckId: '',
    statusResult: null,
    statusLoading: false,
    statusError: null,

    init() {
      this.fetchEvents();
      // Check if URL has registrationId param — auto-load status
      const params = new URLSearchParams(window.location.search);
      const regId = params.get('registrationId');
      if (regId) {
        this.statusCheckId = regId;
        this.checkStatus();
      }
    },

    async fetchEvents() {
      this.loading = true;
      this.error = null;
      try {
        const data = await apiClient.get('/events');
        this.events = (data || []).sort((a, b) => new Date(a.date) - new Date(b.date));
      } catch (err) {
        this.error = err.message || 'Failed to load events';
        this.$store.notification.show(err.message || 'Failed to load events', 'error');
      } finally {
        this.loading = false;
      }
    },

    async viewEvent(eventId) {
      this.loading = true;
      this.error = null;
      try {
        const data = await apiClient.get(`/events/${eventId}`);
        this.selectedEvent = data;
      } catch (err) {
        if (err.status === 404) {
          this.error = 'Event not found';
          this.$store.notification.show('Event not found', 'error');
        } else {
          this.error = err.message || 'Failed to load event details';
          this.$store.notification.show(err.message || 'Failed to load event details', 'error');
        }
      } finally {
        this.loading = false;
      }
    },

    backToList() {
      this.selectedEvent = null;
      this.error = null;
      this.showRegisterForm = false;
      this.registrationResult = null;
      this.formErrors = {};
      this.statusResult = null;
      this.statusError = null;
      // Clear registrationId from URL
      const url = new URL(window.location.href);
      url.searchParams.delete('registrationId');
      window.history.replaceState({}, '', url.toString());
    },

    openRegisterForm() {
      this.showRegisterForm = true;
      this.registration.eventId = this.selectedEvent.eventId;
      this.registration.name = '';
      this.registration.email = '';
      this.registrationResult = null;
      this.formErrors = {};
    },

    async submitRegistration() {
      this.formErrors = {};

      if (!this.registration.name || this.registration.name.length < 2 || this.registration.name.length > 150) {
        this.formErrors.name = 'Name must be between 2 and 150 characters';
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!this.registration.email || !emailRegex.test(this.registration.email)) {
        this.formErrors.email = 'Please enter a valid email address';
      } else if (this.registration.email.length > 254) {
        this.formErrors.email = 'Email must not exceed 254 characters';
      }

      if (Object.keys(this.formErrors).length > 0) {
        return;
      }

      this.submitting = true;
      try {
        const data = await apiClient.post('/registrations', {
          name: this.registration.name,
          email: this.registration.email,
          eventId: this.registration.eventId,
        });
        this.registrationResult = data;
        // Append registrationId to URL so user can bookmark/return later
        const url = new URL(window.location.href);
        url.searchParams.set('registrationId', data.id);
        window.history.replaceState({}, '', url.toString());
      } catch (err) {
        if (err.status === 409) {
          this.$store.notification.show('Email already registered for this event', 'error');
        } else {
          this.$store.notification.show(err.message || 'Failed to create registration', 'error');
        }
      } finally {
        this.submitting = false;
      }
    },

    selectFile(event) {
      const file = event.target.files[0];
      if (!file) {
        this.uploadFile = null;
        return;
      }

      const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg'];
      const maxSize = 5 * 1024 * 1024;

      if (!allowedTypes.includes(file.type)) {
        this.uploadError = 'Formato inválido. Aceitos: PDF, PNG, JPEG';
        this.uploadFile = null;
        return;
      }

      if (file.size > maxSize) {
        this.uploadError = 'Arquivo excede o tamanho máximo de 5 MB';
        this.uploadFile = null;
        return;
      }

      this.uploadFile = file;
      this.uploadError = null;
    },

    async uploadDocument() {
      this.uploading = true;
      this.uploadProgress = 0;
      this.uploadError = null;
      this.uploadSuccess = false;

      const id = this.registrationResult && this.registrationResult.id;

      // Normalize filename: remove accents, replace spaces/special chars with hyphens
      const rawName = this.uploadFile.name;
      const ext = rawName.lastIndexOf('.') > 0 ? rawName.substring(rawName.lastIndexOf('.')) : '';
      const baseName = rawName.substring(0, rawName.length - ext.length);
      const normalizedName = baseName
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') + ext.toLowerCase();

      let uploadUrl;
      try {
        const data = await apiClient.post(`/registrations/${id}/upload-url`, {
          fileName: normalizedName,
          contentType: this.uploadFile.type,
        });
        uploadUrl = data.uploadUrl;
      } catch (err) {
        this.uploadError = err.message || 'Falha ao obter URL de upload';
        this.uploading = false;
        return;
      }

      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', this.uploadFile.type);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          this.uploadProgress = Math.round((e.loaded / e.total) * 100);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          this.uploadSuccess = true;
          if (this.registrationResult) {
            this.registrationResult.status = 'DOCUMENT_UPLOADED';
          }
        } else {
          this.uploadError = 'Falha no upload. Tente novamente.';
        }
      };

      xhr.onerror = () => {
        this.uploadError = 'Falha no upload. Tente novamente.';
      };

      xhr.onloadend = () => {
        this.uploading = false;
      };

      xhr.send(this.uploadFile);
    },

    retryUpload() {
      this.uploadDocument();
    },

    async checkStatus() {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!this.statusCheckId || !uuidRegex.test(this.statusCheckId)) {
        this.statusError = 'Please enter a valid registration ID (UUID format)';
        return;
      }

      this.statusLoading = true;
      this.statusError = null;
      this.statusResult = null;
      try {
        const data = await apiClient.get(`/registrations/${this.statusCheckId}`);
        this.statusResult = data;
        // If status is PENDING_DOCUMENT, set as registrationResult to enable upload
        if (data.status === 'PENDING_DOCUMENT') {
          this.registrationResult = data;
        }
        // Update URL with the registration ID
        const url = new URL(window.location.href);
        url.searchParams.set('registrationId', this.statusCheckId);
        window.history.replaceState({}, '', url.toString());
      } catch (err) {
        if (err.status === 404) {
          this.statusError = 'Registration not found';
        } else {
          this.statusError = err.message || 'Failed to check status';
        }
      } finally {
        this.statusLoading = false;
      }
    },
  }));

  Alpine.data('adminPage', () => ({
    registrations: [],
    loading: false,
    error: null,
    selectedRegistration: null,
    detailLoading: false,
    actionLoading: false,
    rejectReason: '',
    showRejectPrompt: false,
    healthResult: null,
    simulateResult: null,
    criticalResult: null,
    toolLoading: null,
    newEvent: { title: '', description: '', date: '', location: '', capacity: 50 },
    creatingEvent: false,
    createdEvent: null,
    events: [],
    eventsLoading: false,
    deletingEvent: null,

    init() {
      this.fetchEvents();
      this.fetchRegistrations();
    },

    async fetchEvents() {
      this.eventsLoading = true;
      try {
        const data = await apiClient.get('/events');
        this.events = (data || []).sort((a, b) => new Date(a.date) - new Date(b.date));
      } catch (err) {
        this.$store.notification.show(err.message || 'Failed to load events', 'error');
      } finally {
        this.eventsLoading = false;
      }
    },

    async fetchRegistrations() {
      this.loading = true;
      this.error = null;
      try {
        const data = await apiClient.get('/admin/registrations');
        this.registrations = (data || []).sort((a, b) => {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
      } catch (err) {
        this.error = err.message || 'Failed to load registrations';
        this.$store.notification.show(err.message || 'Failed to load registrations', 'error');
      } finally {
        this.loading = false;
      }
    },

    async viewRegistration(id) {
      this.detailLoading = true;
      this.selectedRegistration = null;
      try {
        const data = await apiClient.get(`/admin/registrations/${id}`);
        this.selectedRegistration = data;
      } catch (err) {
        if (err.status === 404) {
          this.error = 'Registration not found';
          this.$store.notification.show('Registration not found', 'error');
        } else {
          this.$store.notification.show(err.message || 'Failed to load registration details', 'error');
        }
      } finally {
        this.detailLoading = false;
      }
    },

    backToList() {
      this.selectedRegistration = null;
    },

    async approveRegistration(id) {
      this.actionLoading = true;
      try {
        const data = await apiClient.post(`/admin/registrations/${id}/approve`);
        if (this.selectedRegistration) {
          this.selectedRegistration.status = data.status || 'APPROVED';
        }
        await this.fetchRegistrations();
      } catch (err) {
        this.$store.notification.show(err.message || 'Failed to approve registration', 'error');
      } finally {
        this.actionLoading = false;
      }
    },

    async rejectRegistration(id) {
      const reason = this.rejectReason.trim();
      if (reason.length < 1 || reason.length > 500) {
        this.$store.notification.show('Motivo deve ter entre 1 e 500 caracteres', 'error');
        return;
      }
      this.actionLoading = true;
      try {
        const data = await apiClient.post(`/admin/registrations/${id}/reject`, { reason });
        if (this.selectedRegistration) {
          this.selectedRegistration.status = data.status || 'REJECTED';
        }
        this.rejectReason = '';
        this.showRejectPrompt = false;
        await this.fetchRegistrations();
      } catch (err) {
        this.$store.notification.show(err.message || 'Falha ao rejeitar inscrição', 'error');
      } finally {
        this.actionLoading = false;
      }
    },

    async deleteRegistration(id) {
      if (!confirm('Tem certeza que deseja excluir esta inscrição?')) return;
      this.actionLoading = true;
      try {
        await apiClient.request('DELETE', `/admin/registrations/${id}`);
        this.selectedRegistration = null;
        this.$store.notification.show('Inscrição excluída com sucesso', 'success');
        await this.fetchRegistrations();
      } catch (err) {
        this.$store.notification.show(err.message || 'Falha ao excluir inscrição', 'error');
      } finally {
        this.actionLoading = false;
      }
    },

    async healthCheck() {
      this.toolLoading = 'health';
      try {
        const data = await apiClient.get('/health');
        this.healthResult = data;
      } catch (err) {
        this.$store.notification.show(err.message || 'Health check failed', 'error');
      } finally {
        this.toolLoading = null;
      }
    },

    async simulateError() {
      this.toolLoading = 'simulate';
      try {
        await apiClient.post('/admin/simulate-error');
      } catch (err) {
        if (err.status && err.status > 0) {
          this.simulateResult = { statusCode: err.status, message: err.message };
        } else {
          this.$store.notification.show(err.message || 'Simulate error request failed', 'error');
        }
      } finally {
        this.toolLoading = null;
      }
    },

    async simulateCriticalError() {
      this.toolLoading = 'critical';
      this.criticalResult = null;
      try {
        await apiClient.post('/admin/simulate-critical-error');
      } catch (err) {
        if (err.status && err.status > 0) {
          this.criticalResult = { message: 'Alerta crítico disparado — verifique seu e-mail em ~5 segundos' };
        } else {
          this.$store.notification.show(err.message || 'Falha ao disparar alerta crítico', 'error');
        }
      } finally {
        this.toolLoading = null;
      }
    },

    async createEvent() {
      this.creatingEvent = true;
      this.createdEvent = null;
      try {
        const data = await apiClient.post('/admin/events', {
          title: this.newEvent.title,
          description: this.newEvent.description,
          date: new Date(this.newEvent.date).toISOString(),
          location: this.newEvent.location,
          capacity: this.newEvent.capacity,
        });
        this.createdEvent = data;
        this.newEvent = { title: '', description: '', date: '', location: '', capacity: 50 };
        await this.fetchEvents();
      } catch (err) {
        this.$store.notification.show(err.message || 'Failed to create event', 'error');
      } finally {
        this.creatingEvent = false;
      }
    },

    async deleteEvent(eventId) {
      this.deletingEvent = eventId;
      try {
        await apiClient.request('DELETE', `/admin/events/${eventId}`);
        this.events = this.events.filter(e => e.eventId !== eventId);
        this.$store.notification.show('Evento cancelado com sucesso!', 'success');
      } catch (err) {
        this.$store.notification.show(err.message || 'Falha ao cancelar evento', 'error');
      } finally {
        this.deletingEvent = null;
      }
    },
  }));
});
