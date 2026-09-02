import { USE_MOCK } from "./config";
import { apiFetch } from "./client";

// Jobs board data service.
//
// The job feed is account-scoped: it matches listings against the signed-in
// user's job-search profile (country, experience, education, graduation
// year), so all of these routes require a Supabase session (apiFetch attaches
// the Bearer token). The first time the tab is opened the user answers a
// questionnaire (GET/PUT /profile); after that GET /api/jobs returns the
// matched feed, and tapping Apply records the application before the browser
// opens the original apply URL. In mock mode the module serves a small set of
// placeholders so the screen is testable without the backend.

const MOCK_LATENCY = 150;
const mockDelay = () => new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY));

const MOCK_JOBS = [
  {
    id: 1,
    company: "Razorpay",
    role: "Software Engineer, Backend",
    location: "Bengaluru, India",
    apply_url: "https://example.com/jobs/1",
    raw_requirements_text:
      "B.E./B.Tech in CS or related. 2+ years building backend services in a modern language. Strong SQL and distributed-systems fundamentals.",
    target_grad_year: null,
    location_country: "India",
    is_remote: false,
    remote_restricted_to: null,
    qualification_paths: [
      { education_level: "bachelor", min_experience_years: 2, max_experience_years: null },
    ],
    applied: false,
  },
  {
    id: 2,
    company: "Zeta",
    role: "SDE Intern (2027)",
    location: "Bengaluru, India",
    apply_url: "https://example.com/jobs/2",
    raw_requirements_text:
      "Open to B.E./B.Tech students graduating in 2027. No professional experience required; coursework in data structures and algorithms expected.",
    target_grad_year: 2027,
    location_country: "India",
    is_remote: false,
    remote_restricted_to: null,
    qualification_paths: [
      { education_level: "bachelor", min_experience_years: 0, max_experience_years: 0 },
    ],
    applied: false,
  },
  {
    id: 3,
    company: "PhonePe",
    role: "Software Development Engineer",
    location: "Bengaluru, India",
    apply_url: "https://example.com/jobs/3",
    raw_requirements_text:
      "Remote within India. Bachelor's plus 3 years, or Master's plus 1 year of relevant experience building large-scale systems.",
    target_grad_year: null,
    location_country: "India",
    is_remote: true,
    remote_restricted_to: "India",
    qualification_paths: [
      { education_level: "bachelor", min_experience_years: 3, max_experience_years: null },
      { education_level: "master", min_experience_years: 1, max_experience_years: null },
    ],
    applied: false,
  },
];

async function mockJobs() {
  await mockDelay();
  return MOCK_JOBS.map((j) => ({ ...j }));
}

// The signed-in user's job profile, or null when it has not been completed.
export async function fetchJobProfile() {
  if (USE_MOCK) return null;
  const res = await apiFetch("/api/jobs/profile");
  if (!res.ok) throw new Error("could not load your job profile");
  const data = await res.json();
  return data.profile || null;
}

// Saves the job-profile questionnaire (first open of the Jobs tab).
export async function saveJobProfile(payload) {
  if (USE_MOCK) return payload;
  const res = await apiFetch("/api/jobs/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("could not save your job profile");
  const data = await res.json();
  return data.profile;
}

// The matched jobs feed for the user. { status: "needs_profile" | "ok" }
export async function fetchJobs() {
  if (USE_MOCK) return { status: "ok", jobs: await mockJobs() };
  const res = await apiFetch("/api/jobs");
  if (!res.ok) throw new Error("could not load the jobs feed");
  return res.json();
}

// Records an application before the redirect. Returns the apply URL.
export async function applyToJob(jobId) {
  if (USE_MOCK) {
    await mockDelay();
    const job = MOCK_JOBS.find((j) => j.id === jobId);
    return job ? job.apply_url : null;
  }
  const res = await apiFetch("/api/jobs/apply", {
    method: "POST",
    body: JSON.stringify({ job_id: jobId }),
  });
  if (!res.ok) throw new Error("could not record the application");
  const data = await res.json();
  return data.apply_url;
}

// Applications the user tapped Apply on that still need a "did this job
// still exist?" answer (asked when they next open the Jobs tab).
export async function fetchPendingApplications() {
  if (USE_MOCK) return [];
  const res = await apiFetch("/api/jobs/applied-pending");
  if (!res.ok) throw new Error("could not load pending applications");
  const data = await res.json();
  return data.pending || [];
}

// Records interest in a job. interested=false means "not interested", which
// hides that posting from this user's feed from now on.
export async function flagJob(jobId, interested) {
  if (USE_MOCK) return;
  const res = await apiFetch("/api/jobs/flag", {
    method: "POST",
    body: JSON.stringify({ job_id: jobId, interested }),
  });
  if (!res.ok) throw new Error("could not save your interest");
  return res.json();
}

// Submits the Yes/No answer for one application (job_existed = true means
// the posting was real/applyable; false means it was gone or dead).
export async function submitApplicationFeedback(jobId, jobExisted) {
  if (USE_MOCK) return;
  const res = await apiFetch("/api/jobs/feedback", {
    method: "POST",
    body: JSON.stringify({ job_id: jobId, job_existed: jobExisted }),
  });
  if (!res.ok) throw new Error("could not save your answer");
  return res.json();
}

// The user's full application history (every job they tapped Apply on).
export async function fetchAppliedJobs() {
  if (USE_MOCK) return [];
  const res = await apiFetch("/api/jobs/applied");
  if (!res.ok) throw new Error("could not load your applications");
  const data = await res.json();
  return data.applied || [];
}
