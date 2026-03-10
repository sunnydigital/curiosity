<div align="center">

# Curiosity

### A nonlinear AI notebook for the curious mind

*We don't think linearly, why investigate so?*

[![Next.js](https://img.shields.io/badge/Next.js_16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Vercel-black?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

</div>

---

Curiosity is a cloud-native AI chat environment that treats conversations as **explorable trees**, not disposable threads. Select any passage, branch into a new line of inquiry, and watch your understanding grow as an interactive graph. With persistent memory, multi-provider LLM support, knowledge bases, and Google OAuth — it's designed for people who follow their curiosity wherever it leads.

**Live at [www.curiosityllm.app](https://www.curiosityllm.app)**

---

## Core Concepts

### Tree Visualization

Your conversation isn't a flat log — it's a living graph. An interactive tree panel (powered by [React Flow](https://reactflow.dev/)) renders every message as a node and every branch as an edge. Click any node to jump there. Drag to pan, scroll to zoom, or use the minimap for orientation. Trunk nodes, branch nodes, user messages, and AI responses each have distinct visual treatments so you always know where you are.

<p align="center">
    <div>
        <img src="https://github.com/sunnydigital/curiosity/blob/website/assets/tree-visualization.gif" alt="Tree Visualization"> 
    </div>
</p>

### Conversation Branching

Every AI response is a launchpad. Highlight any text and instantly fork the conversation into a new branch — *"Learn More"*, *"Explain"*, or *"Get Specifics"* — or write your own custom prompt. Each branch is a first-class conversation thread, complete with its own context and history, while remaining connected to the parent trunk.

<p align="center">
    <div>
        <img src="https://github.com/sunnydigital/curiosity/blob/website/assets/conversation-branching.gif" alt="Tree Visualization"> 
    </div>
</p>

### Persistent Memory

Curiosity extracts facts from your conversations and stores them as vector embeddings. On future chats, semantically relevant memories surface automatically — no manual bookmarking required. Memory retrieval is governed by tunable parameters for **similarity**, **recency**, and **temporal decay**, giving you fine-grained control over what the system remembers and when it forgets.

<p align="center">
    <div>
        <img src="https://github.com/sunnydigital/curiosity/blob/website/assets/persistent-memory.gif" alt="Tree Visualization"> 
    </div>
</p>

### Knowledge Bases

Curate collections of knowledge entries organized by topic. Add entries manually or highlight text in any conversation and send it straight to a knowledge base. Entries are embedded and retrieved alongside memories during chat, enriching the AI's context with your curated reference material.

<p align="center">
    <div>
        <img src="https://github.com/sunnydigital/curiosity/blob/website/assets/knowledge-bases.gif" alt="Tree Visualization"> 
    </div>
</p>

---

## Features

### Multi-Provider LLM Support

Connect to the frontier models you already use — all from a single interface.

| Provider | Models | Auth Methods |
|----------|--------|--------------|
| **OpenAI** | GPT-5, GPT-4.1, GPT-4o, o3, o4-mini, and more | API Key, Codex OAuth |
| **Anthropic** | Claude Opus 4.5, Sonnet 4.5, Haiku 4.5, and more | API Key, OAuth, Setup Token |
| **Google Gemini** | Gemini 2.5 Pro/Flash, 2.0, 1.5 series | API Key |
| **Ollama** | Any locally-hosted model (Llama, Mistral, Phi, etc.) | Local connection |

- **Automatic failover** — configure a priority chain of backup providers. If your primary provider hits a rate limit, auth error, or timeout, Curiosity seamlessly falls back to the next in line.
- **Per-provider default models** — set your preferred model for each provider; switching providers in the taskbar auto-selects your default.
- **Configurable preview models** — lightweight models for generating branch summaries and chat previews.
- **Dynamic model loading** — model lists are fetched live from each provider's API, with hardcoded fallbacks for offline scenarios.

### Embedding System

Flexible vector embedding for memory and knowledge base retrieval.

| Mode | Providers | Models |
|------|-----------|--------|
| **Online** | OpenAI, Gemini | `text-embedding-3-small`, `gemini-embedding-001` |
| **Local** | Ollama | Nomic Embed, MXBai, All-MiniLM, Snowflake Arctic, BGE-M3, and more |

- **Embedding model tracking** — every memory and KB entry records which model generated its embedding, preventing cross-model contamination during similarity search.
- **Re-embedding pipeline** — switch embedding providers at any time; Curiosity will re-embed your entire memory store in the background.

### Rich Rendering

- **GitHub Flavored Markdown** — tables, strikethrough, task lists, footnotes
- **LaTeX mathematics** — inline (`$...$`) and display (`$$...$$`) math via KaTeX
- **Syntax-highlighted code blocks** — language detection, one-click copy, Prism-based highlighting with One Dark theme
- **Responsive typography** — clean prose formatting via `@tailwindcss/typography`

### Conversation Management

- **Projects** — organize chats into folders with preset or custom icons (Research, Writing, Investing, Travel, Homework, and more)
- **Star/favorite** chats for quick access
- **Search** across all conversations
- **Drag-and-drop** chats between projects
- **Export** — download as JSON (full data) or Markdown (formatted), or share excerpts to X, Reddit, or LinkedIn
- **Auto-summaries** — configurable depth from one-liner to comprehensive multi-paragraph analysis

### Text Selection Toolbar

Highlight any text in an AI response to reveal a floating toolbar:

- **Branch actions** — *Learn More*, *Explain*, *Specifics*, or custom prompt
- **Quick summary** — auto-generated summary of the selected passage
- **Knowledge Base** — add the selection directly to any KB
- **Custom shortcuts** — create your own labeled actions with custom prompt prefixes (Ctrl+1 through Ctrl+9)

### Interface

- **Dark & light themes** with system preference detection
- **Collapsible sidebar** with project tree and chat list
- **Resizable tree panel** (250px–800px) with zoom, pan, and minimap
- **Memory panel** with tabs for memories and knowledge bases
- **Image attachments** with automatic vision model detection per provider
- **Streaming responses** via SSE with stop/interrupt support
- **Message actions** — copy, retry, edit & resend

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **UI** | React 19, Radix UI, Shadcn components |
| **Styling** | Tailwind CSS 4, CSS variables for theming |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | Supabase Auth (Google OAuth), @mariozechner/pi-ai (LLM provider OAuth) |
| **Hosting** | Vercel (serverless) |
| **Graph** | @xyflow/react (React Flow) |
| **Markdown** | react-markdown, remark-gfm, remark-math, rehype-katex |
| **Code** | react-syntax-highlighter (Prism) |
| **LLM SDKs** | OpenAI, Anthropic, Google Generative AI, Ollama |
| **Icons** | Lucide React |

---

## Getting Started

### Prerequisites

- **Node.js** 18+
- **npm** (or your preferred package manager)
- A **Supabase** project ([supabase.com](https://supabase.com/))
- *(Optional)* [Ollama](https://ollama.com/) for local model inference

### Installation

```bash
# Clone the repository
git clone https://github.com/sunnydigital/curiosity.git
cd curiosity

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Start the development server (with Turbopack)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start exploring.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Supabase anonymous (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Supabase service role key (server-side only) |

### Database Setup

Run the schema SQL in your Supabase project's SQL Editor. The schema file is included in the repository. All API keys and OAuth tokens are stored securely in the database. Configure LLM providers in the Settings page — no additional environment variables required.

### Ollama (Local Models)

To use locally-hosted models via Ollama, set the CORS origin to allow requests from your domain:

```bash
# macOS
pkill ollama && OLLAMA_ORIGINS="*" ollama serve

# Windows (PowerShell — then restart Ollama)
[System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "*", "User")
```

---

## Architecture

```
curiosity/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (chat, LLM streaming, memory, settings, OAuth)
│   ├── auth/               # Auth callback (Google OAuth via Supabase)
│   └── settings/           # Settings page
├── components/
│   ├── auth/               # Auth listener, login UI
│   ├── chat/               # Chat view, message input, text selection toolbar
│   ├── layout/             # Sidebar, top bar (responsive mobile/desktop)
│   ├── memory/             # Memory panel, knowledge base UI
│   ├── tree/               # Conversation tree visualization
│   └── ui/                 # Shadcn/Radix primitives
├── db/
│   └── queries/            # Typed Supabase query modules
├── hooks/                  # Custom hooks (useOllama, etc.)
├── lib/
│   ├── auth/               # Auth helpers, admin detection
│   ├── llm/                # Provider implementations, embedding, failover
│   ├── memory/             # Fact extraction, memory manager, retrieval
│   ├── oauth/              # LLM provider OAuth flows (pi-ai)
│   └── supabase/           # Supabase client (browser, server, middleware)
├── types/                  # Shared TypeScript interfaces
└── public/                 # Static assets
```

---

## License

MIT
