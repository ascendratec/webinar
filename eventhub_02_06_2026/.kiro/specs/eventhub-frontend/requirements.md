# Requirements Document

## Introduction

EventHub Frontend is a lightweight, static HTML frontend that demonstrates the EventHub backend API capabilities. It provides two distinct routes: a public-facing participant interface for browsing events and managing registrations, and an admin interface for managing registrations and accessing operational endpoints. The frontend uses Alpine.js (via CDN) for reactivity and a classless CSS framework for minimal, clean styling.

## Glossary

- **Frontend**: The static HTML application served to users via a browser
- **Public_Page**: The participant-facing page served at the root path (`/`)
- **Admin_Page**: The administrator-facing page served at `/admin`
- **API_Client**: The JavaScript module responsible for making HTTP requests to the backend API
- **API_Base_URL**: The configurable base URL pointing to the deployed API Gateway endpoint
- **Event_Card**: A UI component displaying summary information about a single event
- **Registration_Form**: A UI component collecting participant name, email, and event selection for registration
- **Status_Badge**: A UI component displaying the current status of a registration with color coding
- **Upload_Widget**: A UI component that handles document upload via presigned URL
- **Registration_List**: A UI component displaying all registrations in a table format on the admin page
- **Alpine_Component**: An Alpine.js reactive component managing state and interactions for a page section

## Requirements

### Requirement 1: API Base URL Configuration

**User Story:** As a developer, I want to configure the API base URL in a single place, so that I can point the frontend to different backend environments without modifying multiple files.

#### Acceptance Criteria

1. THE Frontend SHALL read the API base URL from a JavaScript configuration variable defined at the top of the shared `app.js` script file
2. IF the API base URL configuration variable is undefined, null, or an empty string, THEN THE Frontend SHALL default to `http://localhost:3000`
3. THE API_Client SHALL prepend the configured API base URL to all API request paths, ensuring no duplicate slashes occur between the base URL and the path (e.g., a base URL with a trailing slash and a path with a leading slash SHALL produce a single slash separator)
4. IF the configured API base URL does not start with `http://` or `https://`, THEN THE Frontend SHALL log a warning to the browser console and use the default value `http://localhost:3000`

### Requirement 2: Public Page - Event Listing

**User Story:** As a participant, I want to browse available events, so that I can decide which event to register for.

#### Acceptance Criteria

1. WHEN the Public_Page loads, THE Frontend SHALL fetch and display all active events from the `GET /events` endpoint, sorted by date in ascending order
2. THE Frontend SHALL render each event as an Event_Card showing the title, date (formatted as a human-readable locale date string), location, and available slots
3. WHILE the events are loading, THE Frontend SHALL display a loading indicator
4. IF the `GET /events` request fails, THEN THE Frontend SHALL display an error message with a retry button that re-fetches the event list from `GET /events` when clicked
5. WHEN an event has zero available slots, THE Event_Card SHALL display a "Full" indicator and disable the registration action for that event
6. IF the `GET /events` request returns an empty list, THEN THE Frontend SHALL display a message indicating that no events are currently available

### Requirement 3: Public Page - Event Details

**User Story:** As a participant, I want to view full details of an event, so that I can make an informed decision about registering.

#### Acceptance Criteria

1. WHEN a participant clicks on an Event_Card, THE Frontend SHALL fetch and display the full event details from `GET /events/{eventId}`
2. WHILE the event details request is in progress, THE Frontend SHALL display a loading indicator
3. WHEN the event details are successfully received, THE Frontend SHALL display the event title, description, date, location, capacity, and available slots
4. WHEN the event has zero available slots, THE Frontend SHALL display the "Register" button in a disabled state with a "Full" indicator
5. WHEN the event has one or more available slots, THE Frontend SHALL display an enabled "Register" button within the event details view
6. IF the event details request fails, THEN THE Frontend SHALL display an error message with a retry option
7. IF the event is not found (404 response), THEN THE Frontend SHALL display a "Event not found" message and provide navigation back to the event listing

### Requirement 4: Public Page - Registration Creation

**User Story:** As a participant, I want to register for an event by providing my name and email, so that I can secure a spot.

#### Acceptance Criteria

1. WHEN a participant submits the Registration_Form, THE Frontend SHALL send a `POST /registrations` request with the participant name, email, and selected eventId
2. THE Frontend SHALL validate that the name field is between 2 and 150 characters and that the email field is non-empty before submitting
3. THE Frontend SHALL validate that the email field contains a valid email format (RFC 5322) and does not exceed 254 characters before submitting
4. WHEN the registration is created successfully, THE Frontend SHALL display the registration ID and the status returned by the API to the participant
5. IF the registration request fails, THEN THE Frontend SHALL display the error message returned by the API and preserve the data entered in the form fields
6. WHILE the registration request is in progress, THE Frontend SHALL disable the submit button and display a loading indicator
7. IF the registration request fails with a conflict error indicating duplicate email for the same event, THEN THE Frontend SHALL display an error message indicating the email is already registered for the selected event

### Requirement 5: Public Page - Registration Status Check

**User Story:** As a participant, I want to check the status of my registration, so that I can know if my registration has been approved or if further action is needed.

#### Acceptance Criteria

1. THE Public_Page SHALL provide an input field where a participant can enter a registration ID in UUID v4 format (36 characters, pattern: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
2. WHEN a participant submits a valid registration ID, THE Frontend SHALL fetch the registration details from `GET /registrations/{id}` and display the registration status using a color-coded Status_Badge (PENDING_DOCUMENT: yellow, DOCUMENT_UPLOADED: blue, APPROVED: green, REJECTED: red)
3. IF the participant submits a registration ID that does not match UUID v4 format, THEN THE Frontend SHALL display an inline validation error message indicating the expected format without making an API call
4. IF the registration is not found (API returns 404), THEN THE Frontend SHALL display a "Registration not found" message
5. WHEN the registration status is REJECTED, THE Frontend SHALL display the rejection reason (maximum 500 characters) alongside the Status_Badge
6. IF the API request fails due to a server error or network failure, THEN THE Frontend SHALL display an error message indicating that the status check is temporarily unavailable and allow the participant to retry the request

### Requirement 6: Public Page - Document Upload

**User Story:** As a participant, I want to upload a required document for my registration, so that my registration can be reviewed and approved.

#### Acceptance Criteria

1. WHEN a participant has a registration with status PENDING_DOCUMENT, THE Frontend SHALL display the Upload_Widget allowing the participant to select a file of type PDF, PNG, or JPEG with a maximum size of 5 MB
2. WHEN a participant selects a file that does not match the allowed types (application/pdf, image/png, image/jpeg) or exceeds 5 MB, THE Frontend SHALL display an error message indicating the accepted formats and size limit without making an API request
3. WHEN a participant selects a valid file, THE Frontend SHALL request a presigned upload URL from `POST /registrations/{id}/upload-url` sending the fileName (max 255 characters, alphanumeric with hyphens, underscores, and dots) and contentType
4. WHEN the presigned URL is received, THE Frontend SHALL upload the file directly to S3 using an HTTP PUT request to the presigned URL within the 300-second expiry window
5. WHEN the upload completes successfully, THE Frontend SHALL display a success message indicating the document was sent and update the displayed registration status to DOCUMENT_UPLOADED
6. IF the presigned URL request fails, THEN THE Frontend SHALL display an error message indicating the reason for failure (e.g., registration not found or invalid status) and preserve the Upload_Widget state
7. IF the file upload to S3 fails, THEN THE Frontend SHALL display an error message indicating the upload failure and provide a retry option that re-requests a new presigned URL before reattempting the upload
8. WHILE the file is uploading, THE Frontend SHALL display a progress indicator showing the upload percentage and disable the file selection control until the upload completes or fails

### Requirement 7: Admin Page - Registration List

**User Story:** As an administrator, I want to view all registrations, so that I can manage and review participant registrations.

#### Acceptance Criteria

1. WHEN the Admin_Page loads, THE Frontend SHALL fetch and display all registrations from `GET /admin/registrations`, sorted by creation date in descending order (most recent first)
2. THE Registration_List SHALL display each registration with its ID, participant name, event title, status, and creation date formatted as "DD/MM/YYYY HH:mm"
3. THE Registration_List SHALL display the status using color-coded Status_Badge components with distinct visual styles for each of the four statuses: PENDING_DOCUMENT, DOCUMENT_UPLOADED, APPROVED, and REJECTED
4. WHILE the registrations are loading, THE Frontend SHALL display a loading indicator
5. IF the registrations request fails, THEN THE Frontend SHALL display an error message indicating the failure cause with a retry button that re-triggers the `GET /admin/registrations` request
6. IF the registrations response returns an empty list, THEN THE Frontend SHALL display a message indicating that no registrations exist

### Requirement 8: Admin Page - Registration Details and Actions

**User Story:** As an administrator, I want to view registration details and approve or reject registrations, so that I can manage the event enrollment process.

#### Acceptance Criteria

1. WHEN an administrator clicks on a registration in the list, THE Frontend SHALL fetch and display the full registration details from `GET /admin/registrations/{id}`, showing a loading indicator until the response is received
2. WHEN the registration details are successfully fetched, THE Frontend SHALL display participant name, participant email, event name, registration status, document S3 key, creation timestamp, and last updated timestamp
3. IF the registration status is DOCUMENT_UPLOADED, THEN THE Frontend SHALL display an "Approve" button and a "Reject" button
4. WHEN the administrator clicks "Approve", THE Frontend SHALL disable both action buttons and send a `POST /admin/registrations/{id}/approve` request
5. WHEN the administrator clicks "Reject", THE Frontend SHALL prompt for a rejection reason via a text input that requires between 1 and 500 characters, and upon confirmation send a `POST /admin/registrations/{id}/reject` request with the reason in the request body
6. WHEN an approve or reject action succeeds, THE Frontend SHALL update the displayed status to the value returned by the API, hide the "Approve" and "Reject" buttons, and refresh the registration list
7. IF an approve or reject action fails, THEN THE Frontend SHALL re-enable the action buttons and display the error message returned by the API
8. IF the `GET /admin/registrations/{id}` request fails with a 404 status, THEN THE Frontend SHALL display a message indicating the registration was not found and provide navigation back to the registration list

### Requirement 9: Admin Page - Operational Tools

**User Story:** As an administrator, I want to access operational endpoints like health check and error simulation, so that I can verify system status and test alarm configurations.

#### Acceptance Criteria

1. THE Admin_Page SHALL provide a "Health Check" button that sends a `GET /health` request
2. WHEN the health check response is received, THE Frontend SHALL display the response status and timestamp fields from the JSON payload
3. THE Admin_Page SHALL provide a "Simulate Error" button that sends a `POST /admin/simulate-error` request
4. WHEN the simulate error response is received, THE Frontend SHALL display the HTTP status code and the error message from the response body
5. IF an operational request returns an HTTP error status or a network error occurs, THEN THE Frontend SHALL display an error message indicating the failure reason
6. WHILE an operational request is in progress, THE Frontend SHALL disable the triggered button and display a loading indicator

### Requirement 10: Static File Structure and Serving

**User Story:** As a developer, I want the frontend to be composed of static HTML files that can be served from any static file host, so that deployment is simple and flexible.

#### Acceptance Criteria

1. THE Frontend SHALL consist of static HTML files written in plain HTML, CSS, and browser-native JavaScript that require no server-side rendering, transpilation, or bundling step to function in a browser
2. THE Frontend SHALL load Alpine.js v3.x from a CDN using a script tag
3. THE Frontend SHALL load Pico.css from a CDN as the classless CSS framework for base styling
4. THE Frontend SHALL reference all local assets (scripts, stylesheets) using relative paths so that the files are servable from a local file server or an S3 bucket without changing any file content, with only the API_Base_URL configuration variable differing between environments
5. THE Frontend SHALL organize files as: `index.html` (public page), `admin.html` (admin page), and a shared `app.js` file containing the API client and Alpine.js component definitions

### Requirement 11: Error Handling and User Feedback

**User Story:** As a user, I want clear feedback when something goes wrong, so that I understand what happened and what I can do next.

#### Acceptance Criteria

1. WHEN an API request returns a 4xx status code with a JSON response body containing a `message` field, THE Frontend SHALL display the value of that `message` field in a notification area visible without scrolling
2. IF an API request returns a 4xx status code and the response body does not contain a parseable `message` field, THEN THE Frontend SHALL display a generic "Request error" message in the notification area
3. WHEN an API request returns a 5xx status code, THE Frontend SHALL display a "Server error, please try again later" message in the notification area
4. WHEN a network error occurs (no response received), THE Frontend SHALL display a "Connection error, check your network" message in the notification area
5. WHEN a new error message is displayed while a previous error message is still visible, THE Frontend SHALL replace the previous error message with the new one
6. WHEN 8 seconds have elapsed since an error message was displayed, THE Frontend SHALL automatically dismiss the error message
7. WHEN the user clicks the dismiss button on an error message, THE Frontend SHALL immediately remove the error message from view
