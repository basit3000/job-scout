/**
 * First-screen keyword gap (Rezi / Jobscan style).
 *
 * Classifies posting phrases as already on the CV, evidenced but missing, or not
 * evidenced (must not be invented). Two sources of phrases:
 *   1. a curated lexicon with English + German aliases (below)
 *   2. tokens pulled out of the posting itself (CamelCase names, acronyms, and the
 *      comma lists that follow "experience with" / "Kenntnisse in")
 * so a stack the lexicon has never heard of still shows up as a gap instead of
 * silently disappearing.
 */

const INFLATED_TITLE = /\b(senior|staff|principal|lead|head|director|architect|manager|vp)\b/i;

/**
 * Curated lexicon. `canon` is what gets printed; aliases are matched case-insensitively
 * (short aliases ≤3 chars as whole words). German aliases sit next to the English ones.
 */
const PHRASES = [
  // --- Languages
  { canon: 'Python', aliases: ['python'] },
  { canon: 'Java', aliases: ['java'] },
  { canon: 'JavaScript', aliases: ['javascript', 'js'] },
  { canon: 'TypeScript', aliases: ['typescript', 'ts'] },
  { canon: 'Kotlin', aliases: ['kotlin'] },
  { canon: 'Go', aliases: ['golang', 'go (golang)'] },
  { canon: 'Rust', aliases: ['rust'] },
  { canon: 'C#', aliases: ['c#', 'csharp', 'c sharp'] },
  { canon: 'C++', aliases: ['c++', 'cpp'] },
  { canon: 'C', aliases: ['c/c++', 'ansi c', 'embedded c', 'c programming'] },
  { canon: 'PHP', aliases: ['php'] },
  { canon: 'Ruby', aliases: ['ruby'] },
  { canon: 'Swift', aliases: ['swift'] },
  { canon: 'Scala', aliases: ['scala'] },
  { canon: 'Dart', aliases: ['dart'] },
  { canon: 'Bash', aliases: ['bash', 'shell scripting', 'shell'] },
  { canon: 'SQL', aliases: ['sql'] },
  { canon: 'HTML', aliases: ['html', 'html5'] },
  { canon: 'CSS', aliases: ['css', 'css3', 'sass', 'scss'] },

  // --- Front-end
  { canon: 'React', aliases: ['react', 'react.js', 'reactjs'] },
  { canon: 'Next.js', aliases: ['next.js', 'nextjs', 'next js'] },
  { canon: 'Vue', aliases: ['vue', 'vue.js', 'vuejs', 'nuxt', 'nuxt.js'] },
  { canon: 'Angular', aliases: ['angular', 'angularjs'] },
  { canon: 'Svelte', aliases: ['svelte', 'sveltekit'] },
  { canon: 'Tailwind CSS', aliases: ['tailwind', 'tailwindcss', 'tailwind css'] },
  { canon: 'Redux', aliases: ['redux', 'state management'] },
  { canon: 'Vite', aliases: ['vite'] },
  { canon: 'Webpack', aliases: ['webpack'] },
  { canon: 'React Native', aliases: ['react native', 'react-native'] },
  { canon: 'Flutter', aliases: ['flutter'] },
  { canon: 'Android', aliases: ['android'] },
  { canon: 'iOS', aliases: ['ios'] },
  { canon: 'responsive design', aliases: ['responsive design', 'responsive', 'mobile-first'] },
  { canon: 'accessibility', aliases: ['accessibility', 'a11y', 'wcag', 'barrierefreiheit'] },
  { canon: 'UI/UX', aliases: ['ui/ux', 'ui', 'uis', 'ux', 'user experience', 'user interface', 'user interfaces', 'figma'] },

  // --- Back-end / APIs
  { canon: 'Node.js', aliases: ['node.js', 'nodejs', 'node'] },
  { canon: 'Express', aliases: ['express.js', 'expressjs'] },
  { canon: 'NestJS', aliases: ['nestjs', 'nest.js'] },
  { canon: 'Spring Boot', aliases: ['spring boot', 'springboot', 'spring-boot'] },
  { canon: 'Spring', aliases: ['spring framework', 'spring security', 'spring data', 'spring mvc', 'spring cloud'] },
  { canon: 'Django', aliases: ['django', 'django rest framework', 'drf'] },
  { canon: 'Flask', aliases: ['flask'] },
  { canon: 'FastAPI', aliases: ['fastapi', 'fast api'] },
  { canon: '.NET', aliases: ['.net', 'dotnet', 'asp.net', 'asp.net core', '.net core'] },
  { canon: 'Laravel', aliases: ['laravel', 'symfony'] },
  { canon: 'Rails', aliases: ['ruby on rails', 'rails'] },
  { canon: 'REST API', aliases: ['rest apis', 'rest api', 'rest-api', 'rest-apis', 'restful', 'rest', 'rest-schnittstellen', 'rest-schnittstelle', 'restful apis', 'web apis', 'api design', 'api-design', 'schnittstellen', 'apis', 'api'] },
  { canon: 'SDK', aliases: ['sdk', 'sdks', 'client libraries', 'client library'] },
  { canon: 'webhooks', aliases: ['webhooks', 'webhook', 'integrations', 'third-party apis', 'third party apis'] },
  { canon: 'GraphQL', aliases: ['graphql'] },
  { canon: 'gRPC', aliases: ['grpc', 'protobuf', 'protocol buffers'] },
  { canon: 'WebSockets', aliases: ['websockets', 'websocket', 'real-time', 'realtime'] },
  { canon: 'OpenAPI', aliases: ['openapi', 'swagger'] },
  { canon: 'OAuth', aliases: ['oauth', 'oauth2', 'oidc', 'openid connect', 'keycloak', 'sso'] },
  { canon: 'JWT', aliases: ['jwt', 'json web token'] },
  { canon: 'microservices', aliases: ['microservices', 'microservice', 'micro-services', 'mikroservices', 'microservice-architektur'] },
  { canon: 'event-driven', aliases: ['event-driven', 'event driven', 'message queue', 'message queues', 'messaging', 'pub/sub'] },
  { canon: 'Kafka', aliases: ['kafka', 'apache kafka'] },
  { canon: 'RabbitMQ', aliases: ['rabbitmq', 'amqp'] },
  { canon: 'Celery', aliases: ['celery'] },
  { canon: 'background jobs', aliases: ['background jobs', 'job queue', 'job queues', 'cron', 'scheduler', 'scheduled jobs'] },
  { canon: 'caching', aliases: ['caching', 'cache'] },

  // --- Data
  { canon: 'PostgreSQL', aliases: ['postgresql', 'postgres', 'psql'] },
  { canon: 'MySQL', aliases: ['mysql', 'mariadb'] },
  { canon: 'MongoDB', aliases: ['mongodb', 'mongo'] },
  { canon: 'Redis', aliases: ['redis'] },
  { canon: 'SQLite', aliases: ['sqlite'] },
  { canon: 'Elasticsearch', aliases: ['elasticsearch', 'opensearch', 'elastic stack'] },
  { canon: 'databases', aliases: ['relational databases', 'relational database', 'databases', 'database', 'datenbanken', 'datenbank', 'nosql', 'rdbms'] },
  { canon: 'data modelling', aliases: ['data modelling', 'data modeling', 'datenmodellierung', 'schema design', 'database design'] },
  { canon: 'ORM', aliases: ['sqlalchemy', 'prisma', 'hibernate', 'jpa', 'typeorm', 'sequelize', 'orm'] },
  { canon: 'ETL', aliases: ['etl', 'data pipelines', 'data pipeline', 'datenpipelines'] },
  { canon: 'pandas', aliases: ['pandas', 'numpy'] },

  // --- Cloud / DevOps
  { canon: 'AWS', aliases: ['aws', 'amazon web services', 'ec2', 's3', 'lambda'] },
  { canon: 'Azure', aliases: ['azure', 'microsoft azure'] },
  { canon: 'GCP', aliases: ['gcp', 'google cloud'] },
  { canon: 'Cloud', aliases: ['cloud', 'cloud-native', 'cloud native', 'cloud services', 'cloud-umgebungen'] },
  { canon: 'Docker', aliases: ['docker', 'dockerised', 'dockerized', 'dockerfile', 'containers', 'containerised', 'containerized', 'containerisation', 'containerization', 'containerisierung', 'docker compose'] },
  { canon: 'Kubernetes', aliases: ['kubernetes', 'k8s', 'openshift', 'helm'] },
  { canon: 'Terraform', aliases: ['terraform', 'infrastructure as code', 'iac', 'pulumi'] },
  { canon: 'Ansible', aliases: ['ansible'] },
  { canon: 'CI/CD', aliases: ['ci/cd', 'ci-cd', 'cicd', 'continuous integration', 'continuous delivery', 'continuous deployment', 'build pipelines', 'deployment pipelines', 'pipelines'] },
  { canon: 'Jenkins', aliases: ['jenkins'] },
  { canon: 'GitHub Actions', aliases: ['github actions', 'github-actions'] },
  { canon: 'GitLab CI', aliases: ['gitlab ci', 'gitlab-ci', 'gitlab'] },
  { canon: 'ArgoCD', aliases: ['argocd', 'argo cd'] },
  { canon: 'Git', aliases: ['git', 'github', 'bitbucket', 'version control', 'versionskontrolle', 'versionsverwaltung'] },
  { canon: 'Linux', aliases: ['linux', 'unix', 'ubuntu', 'debian'] },
  { canon: 'Nginx', aliases: ['nginx', 'reverse proxy', 'apache httpd', 'apache2'] },
  { canon: 'monitoring', aliases: ['production monitoring', 'observability', 'monitoring', 'grafana', 'prometheus', 'logging', 'alerting', 'datadog', 'sentry'] },
  { canon: 'DevOps', aliases: ['devops', 'sre', 'site reliability'] },
  { canon: 'serverless', aliases: ['serverless', 'faas'] },

  // --- AI / ML
  { canon: 'LLM', aliases: ['llms', 'llm', 'large language model', 'large language models', 'genai', 'generative ai', 'generative ki', 'gpt', 'foundation models'] },
  { canon: 'OpenAI', aliases: ['openai', 'openai api', 'chatgpt', 'anthropic', 'claude'] },
  { canon: 'LiteLLM', aliases: ['litellm'] },
  { canon: 'LangChain', aliases: ['langchain', 'langgraph', 'llamaindex'] },
  { canon: 'RAG', aliases: ['rag', 'retrieval-augmented', 'retrieval augmented', 'vector database', 'vector db', 'embeddings', 'pgvector', 'pinecone', 'qdrant', 'weaviate'] },
  { canon: 'prompt engineering', aliases: ['prompt engineering', 'prompting', 'prompt design'] },
  { canon: 'AI agents', aliases: ['ai agents', 'agentic', 'agent framework', 'mcp', 'function calling', 'tool calling'] },
  { canon: 'machine learning', aliases: ['machine learning', 'maschinelles lernen', 'ml'] },
  { canon: 'deep learning', aliases: ['deep learning', 'neural networks', 'neuronale netze'] },
  { canon: 'PyTorch', aliases: ['pytorch', 'torch'] },
  { canon: 'TensorFlow', aliases: ['tensorflow', 'keras'] },
  { canon: 'scikit-learn', aliases: ['scikit-learn', 'sklearn', 'scikit learn'] },
  { canon: 'NLP', aliases: ['nlp', 'natural language processing'] },
  { canon: 'computer vision', aliases: ['computer vision', 'opencv', 'image processing', 'bildverarbeitung'] },
  { canon: 'Hugging Face', aliases: ['hugging face', 'huggingface', 'transformers'] },
  { canon: 'MLOps', aliases: ['mlops', 'model deployment', 'model serving'] },
  { canon: 'data science', aliases: ['data science', 'data scientist', 'jupyter'] },

  // --- Practices
  { canon: 'testing', aliases: ['unit tests', 'unit test', 'unit testing', 'unit-tests', 'end-to-end', 'e2e', 'pytest', 'jest', 'junit', 'vitest', 'cypress', 'playwright', 'selenium', 'integration tests', 'integration testing', 'test automation', 'testautomatisierung', 'automated tests', 'automated testing', 'tdd', 'test-driven', 'testing', 'tests', 'qualitätssicherung'] },
  { canon: 'code review', aliases: ['code reviews', 'code review', 'code-review', 'code-reviews', 'pull requests', 'peer review'] },
  { canon: 'agile', aliases: ['agile', 'agil', 'agilen', 'scrum', 'kanban', 'sprint', 'sprints', 'agile methoden', 'agiles arbeiten'] },
  { canon: 'clean code', aliases: ['clean code', 'clean architecture', 'solid principles', 'design patterns', 'entwurfsmuster', 'best practices'] },
  { canon: 'system design', aliases: ['system design', 'software architecture', 'softwarearchitektur', 'architecture', 'architektur', 'distributed systems', 'verteilte systeme', 'scalability', 'scalable', 'skalierbar', 'skalierbare'] },
  { canon: 'performance optimisation', aliases: ['performance optimisation', 'performance optimization', 'performance tuning', 'performance-optimierung', 'latency', 'profiling'] },
  { canon: 'security', aliases: ['security', 'application security', 'owasp', 'it-sicherheit', 'it-security', 'authentication', 'authorization', 'authentifizierung', 'encryption', 'verschlüsselung'] },
  { canon: 'debugging', aliases: ['debugging', 'troubleshooting', 'root cause', 'fehleranalyse', 'fehlersuche'] },
  { canon: 'documentation', aliases: ['documentation', 'technical documentation', 'dokumentation'] },
  { canon: 'requirements analysis', aliases: ['requirements analysis', 'requirements engineering', 'anforderungsanalyse', 'anforderungen analysieren'] },
  { canon: 'data structures & algorithms', aliases: ['data structures', 'algorithms', 'algorithmen', 'datenstrukturen'] },
  { canon: 'object-oriented programming', aliases: ['object-oriented', 'object oriented', 'oop', 'objektorientiert', 'objektorientierte'] },
  { canon: 'functional programming', aliases: ['functional programming', 'funktionale programmierung'] },
  { canon: 'legacy migration', aliases: ['legacy', 'migration', 'modernisation', 'modernization', 'modernisierung', 'refactoring'] },
  { canon: 'open source', aliases: ['open source', 'open-source'] },
  { canon: 'Jira', aliases: ['jira', 'confluence', 'atlassian'] },

  // --- Domain / role words
  { canon: 'full-stack', aliases: ['full-stack', 'fullstack', 'full stack', 'vollstack'] },
  { canon: 'back-end', aliases: ['back-end', 'backend', 'back end', 'backend-entwicklung', 'backend-entwickler'] },
  { canon: 'front-end', aliases: ['front-end', 'frontend', 'front end', 'frontend-entwicklung', 'frontend-entwickler'] },
  { canon: 'web development', aliases: ['web development', 'webentwicklung', 'web applications', 'webanwendungen', 'web apps'] },
  { canon: 'mobile development', aliases: ['mobile development', 'mobile apps', 'mobile app', 'app-entwicklung'] },
  { canon: 'software development', aliases: ['software development', 'softwareentwicklung', 'software engineering'] },
  { canon: 'Softwareentwickler', aliases: ['softwareentwickler', 'softwareentwicklerin', 'software-entwickler', 'entwickler'] },
  { canon: 'Werkstudent', aliases: ['werkstudent', 'werkstudentin', 'working student'] },
  { canon: 'Praktikum', aliases: ['praktikum', 'praktikant', 'internship', 'intern'] },
  { canon: 'Computer Science degree', aliases: ['computer science', 'informatik', 'software engineering degree', 'computer engineering', 'technische informatik', 'b.sc.', 'b.sc', 'bsc', 'm.sc.', 'm.sc', 'msc', 'bachelor', "master's", 'masters degree', 'master degree', 'abgeschlossenes studium', 'hochschulabschluss'] },
  { canon: 'German', aliases: ['german', 'deutsch', 'deutschkenntnisse', 'deutsch (c1)', 'deutsch (b2)', 'german (c1)', 'german (b2)'] },
  { canon: 'English', aliases: ['english', 'englisch', 'englischkenntnisse'] },
  { canon: 'e-commerce', aliases: ['e-commerce', 'ecommerce', 'online shop', 'onlineshop', 'checkout', 'payments', 'stripe'] },
  { canon: 'automotive', aliases: ['automotive', 'infotainment', 'embedded'] },
  { canon: 'SaaS', aliases: ['saas', 'b2b', 'b2c'] },
  { canon: 'ERP', aliases: ['erp', 'sap', 'crm', 'salesforce'] },
];

// Words that look like acronyms/CamelCase but are not skills.
const DYNAMIC_STOP = new Set([
  'the', 'and', 'you', 'our', 'your', 'for', 'with', 'are', 'will', 'who', 'what', 'why', 'how',
  'about', 'eu', 'usa', 'uk', 'de', 'us', 'gmbh', 'ag', 'kg', 'ltd', 'inc', 'llc', 'co', 'se',
  'm/w/d', 'w/m/d', 'd/m/w', 'f/m/d', 'm/f/d', 'm/f/x', 'f/m/x', 'mwd', 'faq', 'hr', 'ceo', 'cto',
  'it', 'ai', 'ki', 'pdf', 'tv', 'ok', 'id', 'vs', 'etc', 'e.g', 'i.e', 'am', 'pm', 'eur', 'usd',
  'b2b', 'b2c', 'a', 'i', 'iot', 'r&d', 'qa', 'pr', 'pto', 'lgbtq', 'covid', 'ceo', 'coo', 'cfo',
  'remote', 'hybrid', 'onsite', 'berlin', 'munich', 'münchen', 'hamburg', 'germany', 'deutschland',
  'europe', 'europa', 'plus', 'bonus', 'ideally', 'preferred', 'required', 'nice', 'strong', 'good',
  'excellent', 'fluent', 'native', 'experience', 'knowledge', 'skills', 'years', 'jahre', 'oder',
  'und', 'mit', 'in', 'von', 'sowie', 'wie', 'z.b', 'bzw', 'ggf', 'ca', 'inkl', 'linkedin', 'xing',
  'indeed', 'stepstone', 'glassdoor', 'apply', 'now', 'kenntnisse', 'erfahrung', 'erfahrungen',
  'u.s', 'ph.d', 'phd', 'mba', 'cv', 'gpa', 'nda', 'kpi', 'kpis', 'roi', 'sla', 'slas',
  // shouted words and regions that are not skills
  'note', 'fully', 'must', 'only', 'please', 'join', 'team', 'new', 'top', 'all', 'any', 'more',
  'best', 'role', 'roles', 'work', 'jobs', 'job', 'hot', 'yes', 'no', 'not', 'one', 'two', 'per',
  'emea', 'apac', 'dach', 'latam', 'amer', 'nyc', 'sf', 'la', 'cet', 'cest', 'utc', 'est', 'pst',
  'bonus', 'free', 'open', 'start', 'asap', 'wfh', 'diversity', 'equal', 'ltd.', 'gmbh.',
]);

// Names that mean nothing on a CV even though they look like skills.
const DYNAMIC_GENERIC = /^(team|teams|product|products|customer|customers|business|company|companies|solution|solutions|platform|service|services|project|projects|data|software|technology|technologies|tools|tool|system|systems|application|applications|framework|frameworks|language|languages|environment|stack|code|development|developer|engineer|engineering|design|quality|process|processes|standards|features|users|clients|experience|skills|knowledge|understanding|background|degree|university|studies|communication|english|german|deutsch|englisch)$/i;

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function boundaryRe(needle) {
  return new RegExp(`(?<![a-z0-9#+.])${escapeRe(needle)}(?![a-z0-9#+])`, 'i');
}

function hasPhrase(haystack, phrase) {
  const aliases = [phrase.canon, ...(phrase.aliases || [])];
  const text = String(haystack || '').toLowerCase();
  return aliases.some((a) => boundaryRe(a.toLowerCase()).test(text));
}

function countPhrase(haystack, phrase) {
  const text = String(haystack || '').toLowerCase();
  let n = 0;
  for (const a of [phrase.canon, ...(phrase.aliases || [])]) {
    const needle = a.toLowerCase();
    const re = new RegExp(`(?<![a-z0-9#+.])${escapeRe(needle)}(?![a-z0-9#+])`, 'gi');
    n += (text.match(re) || []).length;
  }
  return n;
}

const DE_TITLE_MARK = /\b(m\/w\/d|w\/m\/d|d\/m\/w|softwareentwickler|anwendungsentwickler|webentwickler|informatiker|fachinformatiker)\b/i;
const DE_BODY_MARK = /\b(kenntnisse|berufserfahrung|bewerbung|vollzeit|festanstellung|anforderungen|aufgaben|wir bieten|dein profil|deine aufgaben|unser angebot|das bringst du mit|das erwartet dich|bewirb dich|unbefristet|teilzeit|arbeitsort|vergütung)\b/i;
const DE_STOP = /\b(und|oder|mit|für|von|eine|einen|einer|einem|eines|der|die|das|dem|den|im|am|zum|zur|sich|wir|unser|unsere|unseren|unserem|dein|deine|ihre|ihr|sind|wird|werden|haben|ist|als|auch|bei|nach|über|sowie|bitte|auf|aus)\b/gi;
const EN_STOP = /\b(the|and|you|your|with|for|our|are|will|this|that|from|have|has|we|be|or|as|on|in|to|of|role|team|experience|requirements|responsibilities|about|what|who)\b/gi;

function matchCount(text, re) {
  const copy = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  return (String(text || '').match(copy) || []).length;
}

/**
 * Language the ad is *written* in. Umlauts in München/Düsseldorf/company names
 * do not count as a German posting.
 */
export function postingWrittenLanguage(job) {
  const title = String(job?.title || '');
  const desc = String(job?.description || '');
  if (DE_TITLE_MARK.test(title)) return 'de';
  if (!desc.trim()) return DE_BODY_MARK.test(title) ? 'de' : 'en';

  const deStops = matchCount(desc, DE_STOP);
  const enStops = matchCount(desc, EN_STOP);
  const markers = DE_BODY_MARK.test(`${title}\n${desc}`) ? 8 : 0;
  const umlauts = Math.min(matchCount(desc, /[äöüÄÖÜß]/g), 10);
  const deScore = deStops + markers + umlauts;
  if (deScore >= 10 && deScore > enStops * 0.55) return 'de';
  if (deStops >= 12 && deStops > enStops) return 'de';
  return 'en';
}

/** Hard German language requirement vs optional vs none. Does not match "Germany". */
export function detectGermanRequirement(job) {
  const text = `${job?.title || ''}\n${job?.description || ''}`.replace(/\s+/g, ' ');
  if (!text.trim()) return 'none';

  const eitherOk = /\b(?:english or german|german or english|english\s*\/\s*german|german\s*\/\s*english)\b/i.test(text);
  const hardGerman = /\b(?:c1|c2|b2)\b/i.test(text) && /\b(?:german|deutsch)\b/i.test(text)
    || /\b(?:fluent(?:ly)?\s+(?:in\s+)?german|verhandlungssicher(?:es|e|em)?\s+deutsch|flie(?:ss|ß)end(?:es|e)?\s+deutsch|muttersprache\s+deutsch|german(?: language)?(?: skills?)? (?:is |are )?(?:required|mandatory)|deutsch ist (?:erforderlich|pflicht))\b/i.test(text);

  if (eitherOk && !hardGerman) return 'none';

  const optional = [
    /\b(?:german|deutsch(?:kenntnisse)?)\b[^.!?\n]{0,55}\b(?:a plus|plus|nice[- ]to[- ]have|advantage|advantageous|beneficial|preferred|ideally|von vorteil|wünschenswert|optional)\b/i,
    /\b(?:a plus|plus|nice[- ]to[- ]have|advantage|von vorteil|wünschenswert|optional)\b[^.!?\n]{0,55}\b(?:german|deutsch(?:kenntnisse)?)\b/i,
  ].some((re) => re.test(text));

  const required = [
    /\bgerman\s*(?:language\s*)?(?:skills?\s*)?[:()–\-]?\s*(?:min(?:imum|\.)?\s*)?(?:level\s*)?(?:c1|c2|b2)\b/i,
    /\b(?:min(?:imum|\.)?\s*)?(?:level\s*)?(?:c1|c2|b2)\s*(?:level\s+)?(?:in\s+)?german\b/i,
    /\bdeutsch(?:kenntnisse)?\s*[:()–\-]?\s*(?:mind(?:est(?:ens)?)?\.?\s*)?(?:niveau\s*)?(?:c1|c2|b2)\b/i,
    /\b(?:c1|c2|b2)[- ]niveau.{0,24}deutsch/i,
    /\bniveau\s*(?:c1|c2|b2).{0,24}deutsch/i,
    /\b(?:fluent(?:ly)?|business[- ]fluent|native|proficient|excellent|very good)\s+(?:in\s+)?german\b/i,
    /\bfluency in german\b/i,
    /\bgerman\s+(?:fluency|native(?: speaker)?|speaker)\b/i,
    /\bgerman[- ]speaking\b/i,
    /\b(?:must|required to|need to)\s+speak\s+german\b/i,
    /\bgerman(?: language)?(?: skills?)?\s+(?:is |are )?(?:required|mandatory|a must|necessary|essential)\b/i,
    /\b(?:required|mandatory|must have|essential)[:\s]+[^.]{0,48}\bgerman\b/i,
    /\bverhandlungssicher(?:es|e|em)?\s+deutsch/i,
    /\bflie(?:ss|ß)end(?:es|e)?\s+deutsch/i,
    /\bdeutschkenntnisse\b/i,
    /\bmuttersprache\s+deutsch\b/i,
    /\b(?:sehr\s+)?gute[sn]?\s+deutsch(?:kenntnisse)?\b/i,
    /\bdeutsch\s+(?:ist\s+)?(?:erforderlich|voraussetzung|pflicht|zwingend|notwendig)\b/i,
    /\bworking language is german\b/i,
    /\bgerman as (?:a |the )?working language\b/i,
    /\b(?:team|company|business) language(?: is|:)\s*german\b/i,
    /\bsprichst\s+(?:flie(?:ss|ß)end\s+)?deutsch\b/i,
    /\bdu\s+sprichst\s+deutsch\b/i,
  ].some((re) => re.test(text));

  if (optional && !hardGerman) return 'optional';
  if (!required) return 'none';
  return 'required';
}

/** True when the ad itself is written in German (CV tailor language). */
export function isGermanPosting(job) {
  return postingWrittenLanguage(job) === 'de';
}

/**
 * Results/Digest language filter:
 * `en` = English-written and no hard German requirement (C1/B2/fluent).
 * `de` = German-written, or English-written that still requires German.
 */
export function detectPostingLanguage(job) {
  if (postingWrittenLanguage(job) === 'de') return 'de';
  return detectGermanRequirement(job) === 'required' ? 'de' : 'en';
}

export function jobMatchesLanguageFilter(job, lang) {
  if (!lang || lang === 'all') return true;
  const detected = job?.language || detectPostingLanguage(job);
  return detected === lang;
}

/**
 * Strip the noise recruiters put in titles so what is left can sit on a CV headline:
 * "(m/w/d)", "(all genders)", "- Remote", "| Berlin", "100%", "Vollzeit", "*in".
 */
export function cleanJobTitle(raw) {
  let t = String(raw || '').replace(/\s+/g, ' ').trim();
  t = t
    .replace(/[(\[]\s*(?:all genders|alle geschlechter|m\/w\/d|w\/m\/d|d\/m\/w|m\/f\/d|f\/m\/d|m\/f\/x|f\/m\/x|m\/w\/x|x\/f\/m|gn|div\.?)\s*[)\]]/gi, ' ')
    .replace(/\b(?:m\/w\/d|w\/m\/d|d\/m\/w|m\/f\/d|f\/m\/d|m\/f\/x|f\/m\/x)\b/gi, ' ')
    .replace(/\*in(nen)?\b/gi, '') // Entwickler*in → Entwickler
    .replace(/:in(nen)?\b/gi, '')
    .replace(/\((?:[^()]*\b(?:remote|hybrid|onsite|on-site|vollzeit|teilzeit|full[- ]time|part[- ]time|unbefristet|befristet|\d{2,3}\s?%)\b[^()]*)\)/gi, ' ')
    .replace(/\s[-–—|:,/]\s.*$/g, '') // "Software Engineer - Berlin", "Developer | Remote"
    .replace(/\b(?:remote|hybrid|onsite|on-site|vollzeit|teilzeit|full[- ]time|part[- ]time|unbefristet|befristet|festanstellung|ab sofort|asap|urgent|hiring|now hiring|immediate start|new)\b/gi, ' ')
    .replace(/\b\d{2,3}\s?%/g, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—|:,/]+|[\s\-–—|:,/]+$/g, '')
    .trim();
  return t;
}

const DEV_TITLE = /\b(software|developer|engineer|entwickler|programmer|programmierer|full[-\s]?stack|fullstack|back[-\s]?end|front[-\s]?end|devops|web|cloud|data|platform|application|python|java|typescript|javascript|node|react|kotlin|android|ml|ai|informatiker)\b/i;

export function honestHeadlineTitle(jobTitle, targetRole = 'Software Developer') {
  const fallback = String(targetRole || 'Software Developer').trim() || 'Software Developer';
  const cleaned = cleanJobTitle(jobTitle);
  if (!cleaned) return fallback;
  if (INFLATED_TITLE.test(cleaned)) return fallback;
  if (DEV_TITLE.test(cleaned) && cleaned.length <= 60) return cleaned;
  return fallback;
}

// ---------------------------------------------------------------------------
// Dynamic extraction from the posting text
// ---------------------------------------------------------------------------

const LIST_TRIGGERS = /(?:experience (?:with|in|of|using)|knowledge (?:of|in)|familiar(?:ity)? with|proficien(?:t|cy) (?:in|with)|skilled in|working with|background in|expertise in|hands-on (?:with|experience)|tech(?:nology)? stack|our stack|stack:|technologies:|skills:|tools:|kenntnisse (?:in|mit|von)|erfahrung (?:mit|in)|erfahrungen (?:mit|in)|umgang mit|sicherer umgang mit|vertraut mit|technologien:|wir arbeiten mit|unser stack|du arbeitest mit|sie arbeiten mit)\s*:?\s*([^.\n;:]{3,200})/gi;

/** Split "Python, FastAPI and Docker or Kubernetes" into its items. */
function splitList(fragment) {
  return String(fragment)
    .replace(/\((?:e\.?g\.?|z\.?b\.?|bspw\.?|wie|such as|like)\s*/gi, '(')
    .replace(/[()]/g, ',')
    .split(/,|;|\/| and | or | und | oder | sowie | bzw\.? | & | \+ /i)
    .map((s) => s.replace(/^(?:e\.?g\.?|z\.?b\.?|such as|like|especially|including|incl\.?|etc\.?|preferably|ideally|idealerweise|vorzugsweise|wünschenswert|von vorteil|plus|bonus)\s*/i, '').trim())
    .map((s) => s.replace(/^(?:the|a|an|modern|current|common|relevant|relevanten|modernen|gängigen)\s+/i, ''))
    .filter((s) => s && s.length >= 2 && s.length <= 32 && s.split(/\s+/).length <= 3);
}

/**
 * Names the lexicon does not know: CamelCase tokens, dotted names (Vue.js), acronyms,
 * and items from "experience with …" lists. Each is returned as a phrase with a
 * single alias so it flows through the same on-CV / promote / gap classification.
 */
export function extractDynamicPhrases(text, known = PHRASES) {
  const src = String(text || '');
  const knownAliases = new Set();
  for (const p of known) for (const a of [p.canon, ...(p.aliases || [])]) knownAliases.add(a.toLowerCase());

  const candidates = new Map(); // lower → { disp, hits }
  const consider = (raw) => {
    const disp = String(raw).replace(/[.,;:!?)]+$/g, '').replace(/^[("']+/g, '').trim();
    if (!disp) return;
    const low = disp.toLowerCase();
    if (low.length < 2 || low.length > 32) return;
    if (knownAliases.has(low) || DYNAMIC_STOP.has(low) || DYNAMIC_GENERIC.test(low)) return;
    if (/^\d+(\.\d+)?$/.test(low)) return;
    if (/^www\.|\.(com|de|org|co|eu|ch|at|uk|net\.[a-z]+)$/.test(low) || low.split('.').length > 2) return; // hostnames
    if (/^[a-z]+$/.test(low) && !/^[A-Z]/.test(disp)) return; // plain lowercase word → too generic
    // German nouns are capitalised; skip the ones shaped like abstract nouns, not products.
    if (/(?:keit|heit|ung|schaft|ion|ismus|tät|nis|erfahrung|kenntnisse)$/i.test(low) && !/[#+.\d]/.test(low)) return;
    const cur = candidates.get(low);
    if (cur) cur.hits += 1;
    else candidates.set(low, { disp, hits: 1 });
  };

  // Dotted or symbol-bearing names: Vue.js, Node.js, C#, C++, .NET, ASP.NET
  for (const m of src.matchAll(/(?<![\w/@])(?:\.?[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+|[A-Za-z][A-Za-z0-9]*[#+]+)(?![\w])/g)) consider(m[0]);
  // CamelCase names: PostgreSQL, GraphQL, OpenShift, TypeScript
  for (const m of src.matchAll(/\b[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]+)+\b|\b[A-Z]{2,}[a-z]+[A-Za-z0-9]*\b/g)) consider(m[0]);
  // Acronyms (2–5 caps) — only from lines that are not shouted headings, and only when
  // the same letters do not also appear as an ordinary word elsewhere ("BRING" vs "bring").
  for (const line of src.split(/\r?\n/)) {
    if (!/[a-z]/.test(line)) continue;
    for (const m of line.matchAll(/\b[A-Z][A-Z0-9]{1,4}\b/g)) {
      const tok = m[0];
      if (/^\d/.test(tok)) continue;
      const asWord = new RegExp(`\\b${tok[0]}${tok.slice(1).toLowerCase()}\\b|\\b${tok.toLowerCase()}\\b`);
      if (asWord.test(src)) continue;
      consider(tok);
    }
  }
  // Comma lists behind trigger phrases
  for (const m of src.matchAll(LIST_TRIGGERS)) {
    for (const item of splitList(m[1])) {
      const oneWord = !/\s/.test(item);
      if (/[#+.\d]/.test(item) || /[a-z][A-Z]/.test(item) || (oneWord && /^[A-Z]/.test(item) && item.length <= 12)) consider(item);
    }
  }

  return [...candidates.entries()]
    .sort((a, b) => b[1].hits - a[1].hits)
    .slice(0, 25)
    .map(([low, { disp }]) => ({ canon: disp, aliases: [low], dynamic: true }));
}

const OPTIONAL_CUE = /\b(nice[- ]to[- ]have|plus|bonus|ideally|preferably|optional|advantage|a plus|beneficial|wünschenswert|von vorteil|idealerweise|vorzugsweise|optional|gerne|ein plus|pluspunkt)\b/i;

/** Sentence/line containing the first hit, for required-vs-optional cues. */
function contextOf(text, phrase) {
  const lines = String(text).split(/\n|(?<=[.!?])\s+/);
  for (const line of lines) if (hasPhrase(line, phrase)) return line;
  return '';
}

/**
 * All posting phrases (lexicon + dynamic), each with a weight:
 *   in title ×3, each mention ×1, optional-cue → flagged.
 */
export function extractPostingPhrases(job, { dynamic = true } = {}) {
  const title = String(job?.title || '');
  const desc = String(job?.description || '');
  const text = `${title}\n${desc}`;
  const found = [];
  const seen = new Set();
  const pool = dynamic ? [...PHRASES, ...extractDynamicPhrases(text)] : PHRASES;
  for (const phrase of pool) {
    if (!hasPhrase(text, phrase)) continue;
    const key = phrase.canon.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const mentions = countPhrase(text, phrase);
    const inTitle = hasPhrase(title, phrase);
    const ctx = contextOf(desc, phrase);
    found.push({
      ...phrase,
      mentions,
      inTitle,
      optional: OPTIONAL_CUE.test(ctx),
      weight: mentions + (inTitle ? 3 : 0) + (OPTIONAL_CUE.test(ctx) ? -1 : 0),
    });
  }
  found.sort((a, b) => b.weight - a.weight || a.canon.localeCompare(b.canon));
  return found;
}

const REQ_HEADINGS = /^(?:\W*)(?:requirements?|qualifications?|your profile|what you bring|what you(?:'ll)? need|what we(?:'re)? looking for|who you are|about you|must[- ]haves?|skills(?: & experience| and experience)?|your skills|profile|dein profil|ihr profil|das bringst du mit|was du mitbringst|was sie mitbringen|anforderungen|qualifikationen|voraussetzungen|dein background|deine skills|wir erwarten)\b[^\n]{0,40}$/i;
const STOP_HEADINGS = /^(?:\W*)(?:benefits?|perks|what we offer|we offer|why us|about us|our offer|wir bieten|das bieten wir|deine vorteile|unser angebot|über uns|your tasks|your role|responsibilities|deine aufgaben|ihre aufgaben|aufgaben|the role|your mission|how to apply|contact|kontakt|application|bewerbung)\b[^\n]{0,40}$/i;

/**
 * Bullet lines from the requirements block of a posting. These are the sentences a
 * screener compares the CV against, so the writer should read them verbatim.
 */
export function extractRequirementLines(description, { max = 14 } = {}) {
  const lines = String(description || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  let inBlock = false;
  for (const line of lines) {
    const short = line.length <= 70;
    if (short && REQ_HEADINGS.test(line)) {
      inBlock = true;
      continue;
    }
    if (short && STOP_HEADINGS.test(line)) {
      inBlock = false;
      continue;
    }
    if (!inBlock) continue;
    const clean = line.replace(/^[-•*·▪●◦–—>\d.)\s]+/, '').trim();
    if (clean.length < 12 || clean.length > 260) continue;
    out.push(clean);
    if (out.length >= max) break;
  }
  if (out.length) return out;
  // No headings: fall back to sentences that carry a requirement verb.
  const sentences = String(description || '').split(/(?<=[.!?])\s+|\n/).map((s) => s.trim());
  return sentences
    .filter((s) => s.length >= 25 && s.length <= 260 && /\b(experience|knowledge|proficien|familiar|degree|years|required|must|should|erfahrung|kenntnisse|abgeschlossen|studium|sicherer umgang|du hast|sie haben|you have|you are)\b/i.test(s))
    .slice(0, max);
}

/**
 * @returns {{
 *   onCv: string[], promote: string[], gaps: string[],
 *   optional: string[], headline: string, german: boolean,
 *   requirements: string[], phrases: Array<object>,
 * }}
 */
export function analyzeKeywordGaps({ job, cvText = '', evidenceText = '', profile = {} } = {}) {
  const phrases = extractPostingPhrases(job);
  const cv = String(cvText || '');
  const evidence = `${evidenceText}\n${(profile.skills?.strong || []).join(' ')}\n${(profile.skills?.familiar || []).join(' ')}`;
  const onCv = [];
  const promote = [];
  const gaps = [];
  const unknownNames = [];
  const optional = [];

  for (const phrase of phrases) {
    if (phrase.optional) optional.push(phrase.canon);
    if (hasPhrase(cv, phrase)) onCv.push(phrase.canon);
    else if (hasPhrase(evidence, phrase)) promote.push(phrase.canon);
    else if (phrase.dynamic) unknownNames.push(phrase.canon);
    else gaps.push(phrase.canon);
  }
  // Names lifted from the posting text are still gaps (a screener may look for them),
  // but they are listed separately because some will be companies or products.
  gaps.push(...unknownNames);

  // Headline: the honest title plus the heaviest evidenced tech names (never soft words).
  const notForHeadline = new Set(['UI/UX', 'SaaS', 'SDK', 'ERP', 'German', 'English', 'Computer Science degree', 'Werkstudent', 'Praktikum', 'Softwareentwickler', 'Jira', 'Git', 'ORM', 'RAG']);
  const techLike = (c) => /^[A-Z0-9.#+/]/.test(c) && !notForHeadline.has(c) && !/\b(degree|agile|testing|documentation)\b/i.test(c);
  const headlineSkills = [...onCv, ...promote].filter(techLike).slice(0, 5);
  const title = honestHeadlineTitle(job?.title, profile.targetRole || profile.headline);
  const headline = headlineSkills.length ? `${title} — ${headlineSkills.join(', ')}` : title;

  return {
    onCv,
    promote,
    gaps,
    unknownNames,
    optional,
    headline,
    german: isGermanPosting(job),
    postingPhraseCount: phrases.length,
    requirements: extractRequirementLines(job?.description),
    phrases: phrases.map(({ canon, mentions, inTitle, optional: opt, dynamic }) => ({ canon, mentions, inTitle, optional: opt, dynamic: Boolean(dynamic) })),
  };
}

export function formatKeywordGapsMarkdown(analysis, job = {}) {
  const a = analysis || {};
  const opt = new Set(a.optional || []);
  const unknown = new Set(a.unknownNames || []);
  const lexiconGaps = (a.gaps || []).filter((g) => !unknown.has(g));
  const tag = (s) => (opt.has(s) ? `${s} _(nice-to-have)_` : s);
  const lines = [
    '# First-screen keyword gaps',
    '',
    `Job: ${job.title || '?'} @ ${job.company || '?'}`,
    a.german ? 'Posting language: German — pair English tech names with the German role noun when true.' : 'Posting language: English.',
    '',
    `Suggested headline (honest title + evidenced JD skills): **${a.headline || ''}**`,
    '',
    '## Already on the CV (keep / lead with these)',
    '',
    ...(a.onCv?.length ? a.onCv.map((s) => `- ${tag(s)}`) : ['- _(none matched)_']),
    '',
    '## Evidenced but missing from the current CV (promote into headline, skills, or a bullet)',
    '',
    ...(a.promote?.length ? a.promote.map((s) => `- ${tag(s)}`) : ['- _(none)_']),
    '',
    '## In the posting, not evidenced (do not invent)',
    '',
    ...(lexiconGaps.length ? lexiconGaps.map((s) => `- ${tag(s)}`) : ['- _(none)_']),
    '',
  ];
  if (unknown.size) {
    lines.push(
      '### Other names in the posting text (may be products, clients, or tools — claim only if evidenced)',
      '',
      ...[...unknown].map((s) => `- ${tag(s)}`),
      '',
    );
  }
  if (a.requirements?.length) {
    lines.push(
      '## Requirement lines from the posting (a screener compares the CV against these)',
      '',
      ...a.requirements.map((r) => `- ${r}`),
      '',
      'For each line you can honestly answer, one Experience or Projects bullet should contain the same nouns.',
      '',
    );
  }
  lines.push(
    'Every **Already** / **Promote** phrase that you claim must appear in a bullet, not only the Skills line.',
    'AI screeners (Ashby, Greenhouse, Workday copilots) quote an evidence sentence — Skills-only hits often score “does not meet”.',
    'Write the exact spelling the posting uses (PostgreSQL, not Postgres; CI/CD, not CICD) at least once.',
    '',
  );
  return lines.join('\n');
}
