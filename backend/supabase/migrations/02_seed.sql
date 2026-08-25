-- Seed user profile
INSERT INTO user_profile (
  base_location,
  remote_ok,
  pay_floor_ncr_remote,
  pay_floor_other_cities,
  target_roles,
  target_tiers,
  dream_companies,
  graduation_date,
  auto_apply_enabled
) VALUES (
  'Noida, Delhi NCR',
  true,
  600000,
  '{"Bangalore": 800000, "Mumbai": 800000}',
  ARRAY['Backend Engineer', 'Generative AI Engineer', 'AI Engineer', 'Software Development Engineer', 'Full Stack Engineer'],
  ARRAY['Tier 1', 'Tier 2', 'Startup', 'MNC'],
  ARRAY['OpenAI', 'Anthropic', 'Google', 'Microsoft', 'Ultimate Flexipack'],
  '2027-06-01',
  false
);

-- Seed resume versions based on provided documents
INSERT INTO resume_versions (
  file_path,
  target_type,
  title,
  skills_summary
) VALUES 
(
  'resumes/shreyansh_backend_genai.pdf',
  'backend',
  'Backend & Generative AI Engineer',
  'Python, C++, JavaScript, TypeScript, SQL, FastAPI, REST APIs, WebSockets, Microservices, Authentication, Event-Driven Architecture, MySQL, Supabase (Postgres), Qdrant, RAG, LangChain, Prompt Engineering, Embeddings, Semantic Search, OpenAI GPT-4o, Llama 4, YOLOv8, React, Next.js'
),
(
  'resumes/shreyansh_genai.pdf',
  'genai',
  'Generative AI Engineer',
  'Docker, FastAPI production services, Event-Driven Architecture, RAG, LangChain, Prompt Engineering, Embeddings, Semantic Search, OpenAI GPT-4o, Llama 4, Agentic Workflows, NLP, Python, C++, SQL, React, Next.js, YOLOv8, Qdrant'
),
(
  'resumes/shreyansh_ai_engineer.pdf',
  'llmops',
  'AI Engineer | Generative AI & LLM Systems',
  'RAG (Retrieval-Augmented Generation), LangChain, Prompt Engineering, Vector Databases (Qdrant), Embeddings, Semantic Search, OpenAI GPT-4o, Llama 4, Agentic Workflows, Model Evaluation, NLP, Computer Vision, FastAPI, WebSockets, Microservices, React, Next.js'
);
