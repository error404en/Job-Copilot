"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInButton } from "@clerk/nextjs";

const FEATURES = [
  {
    kicker: "/01 Jobs Feed",
    title: "Roles ranked by fit",
    body: "Every posting scored against your primary resume, so the best matches rise to the top.",
    href: "/",
  },
  {
    kicker: "/02 Daily Digest",
    title: "Your morning shortlist",
    body: "A short brief of new matches, closing deadlines and what to do first today.",
    href: "/digest",
  },
  {
    kicker: "/03 Lead Inbox",
    title: "Paste it. We parse it.",
    body: "Drop in links, job text or screenshots from anywhere and get structured, scored leads.",
    href: "/inbox",
  },
  {
    kicker: "/04 Tracker",
    title: "Every application, one board",
    body: "Move roles from saved to applied to interviewing without a spreadsheet.",
    href: "/tracker",
  },
  {
    kicker: "/05 Resume Vault",
    title: "Versions that stay organised",
    body: "Keep a parsed primary resume and role-specific variants side by side.",
    href: "/resumes",
  },
  {
    kicker: "/06 AI Career Coach",
    title: "Ask anything about a role",
    body: "Mock interviews, gap-closing strategies and custom pitch advice grounded in the JD.",
    href: "/coach",
  },
];

export default function WelcomePage() {
  const [activeFan, setActiveFan] = useState<number | null>(null);

  useEffect(() => {
    const prevBg = document.documentElement.style.backgroundColor;
    document.documentElement.style.backgroundColor = "#050507";
    return () => {
      document.documentElement.style.backgroundColor = prevBg;
    };
  }, []);

  return (
    <div className="pg w-full overflow-x-hidden selection:bg-[#2F3DFF]/30">
      {/* ===================== HERO SECTION ===================== */}
      <section
        style={{
          position: "relative",
          minHeight: "860px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 24px",
          boxSizing: "border-box",
        }}
      >
        {/* Animated Background 3D Grid Floor & Light Streaks */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "62%",
              perspective: "700px",
              maskImage: "linear-gradient(180deg, transparent 0%, #000 72%)",
              WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 72%)",
            }}
          >
            <div
              className="gridfloor"
              style={{
                position: "absolute",
                left: "-50%",
                right: "-50%",
                top: 0,
                bottom: 0,
                transform: "rotateX(64deg)",
                transformOrigin: "50% 100%",
              }}
            />
          </div>

          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "-10%",
              width: "1100px",
              height: "520px",
              transform: "translateX(-50%)",
              background:
                "radial-gradient(ellipse at 50% 100%, rgba(80,96,255,0.32), transparent 65%)",
            }}
          />

          <svg
            aria-hidden="true"
            fill="none"
            height="100%"
            preserveAspectRatio="none"
            viewBox="0 0 1440 860"
            width="100%"
          >
            <path
              d="M-80 600 C 260 430, 560 760, 900 520 S 1400 380, 1540 450"
              stroke="rgba(140,151,255,0.14)"
              strokeWidth="1.2"
            />
            <path
              className="streak s1"
              d="M-80 600 C 260 430, 560 760, 900 520 S 1400 380, 1540 450"
              stroke="#8C97FF"
              strokeLinecap="round"
              strokeWidth="2"
            />
            <path
              d="M-80 300 C 300 180, 620 420, 980 260 S 1380 120, 1540 200"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1.2"
            />
            <path
              className="streak s2"
              d="M-80 300 C 300 180, 620 420, 980 260 S 1380 120, 1540 200"
              stroke="#FFFFFF"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
            <path
              d="M-80 760 C 340 640, 700 820, 1060 700 S 1400 600, 1540 640"
              stroke="rgba(140,151,255,0.12)"
              strokeWidth="1.2"
            />
            <path
              className="streak s3"
              d="M-80 760 C 340 640, 700 820, 1060 700 S 1400 600, 1540 640"
              stroke="#8C97FF"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
            <path
              d="M-80 120 C 240 60, 640 200, 1000 90 S 1360 20, 1540 70"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1.2"
            />
            <path
              className="streak s4"
              d="M-80 120 C 240 60, 640 200, 1000 90 S 1360 20, 1540 70"
              stroke="#FFFFFF"
              strokeLinecap="round"
              strokeWidth="1.4"
            />
          </svg>
        </div>

        {/* Top Navbar */}
        <header
          style={{
            position: "relative",
            width: "100%",
            maxWidth: "1240px",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "28px 0",
          }}
        >
          <Link href="/welcome" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg
              aria-hidden="true"
              fill="none"
              height="26"
              viewBox="0 0 24 24"
              stroke="#F3EFE7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              width="26"
            >
              <path d="M3 20 12 3l9 17" />
              <path d="M7.5 14h9" />
            </svg>
            <span style={{ fontSize: "18px", fontWeight: 600, letterSpacing: "-0.02em" }}>
              JobCopilot
            </span>
          </Link>
          <nav aria-label="Site" style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
            <a className="navlink" href="#how">How it works</a>
            <a className="navlink" href="#report">Reports</a>
            <a className="navlink" href="#features">Features</a>
            <Link className="navlink" href="/settings">Extension</Link>
            <Link className="navlink" href="/">Dashboard</Link>
            <SignInButton mode="modal">
              <button
                type="button"
                className="pill pill-g"
                style={{ marginLeft: "8px", height: "40px" }}
              >
                Sign in
              </button>
            </SignInButton>
          </nav>
        </header>

        {/* Hero Title & CTAs */}
        <div
          style={{
            position: "relative",
            flex: 1,
            width: "100%",
            maxWidth: "1040px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: "28px",
            padding: "40px 0 120px",
          }}
        >
          <span className="mono rise" style={{ color: "#8C97FF", animationDelay: ".05s" }}>
            / AI job-search copilot
          </span>
          <h1
            className="serif rise"
            style={{ fontSize: "clamp(46px, 8vw, 104px)", lineHeight: 1.02, animationDelay: ".15s" }}
          >
            Apply to fewer jobs.<br />
            <i>Land</i> more of them.
          </h1>
          <p
            className="rise"
            style={{
              margin: 0,
              maxWidth: "560px",
              fontSize: "18px",
              lineHeight: 1.55,
              color: "#B4B1A9",
              animationDelay: ".3s",
            }}
          >
            JobCopilot reads every posting against your resume, scores your fit, and drafts the application so it sounds like you.
          </p>
          <div
            className="rise"
            style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "center", animationDelay: ".45s" }}
          >
            <Link className="pill pill-c" href="/">
              Open the app <span aria-hidden="true">→</span>
            </Link>
            <a className="pill pill-g" href="#how">
              See how it scores a job <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>

        {/* Marquee Ticker */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            overflow: "hidden",
            background: "rgba(5,5,7,0.6)",
          }}
        >
          <div aria-hidden="true" className="marq">
            <div
              className="mono"
              style={{
                display: "flex",
                gap: "48px",
                padding: "18px 24px",
                fontSize: "13px",
                color: "#8E8C86",
                whiteSpace: "nowrap",
              }}
            >
              <span>/Greenhouse</span>
              <span>/Lever</span>
              <span>/Workday</span>
              <span>/Ashby</span>
              <span>/SmartRecruiters</span>
              <span>/Keka</span>
              <span>/Stripe</span>
              <span>/Goldman Sachs</span>
              <span>/Parse every JD</span>
              <span>/Score your fit</span>
              <span>/Write like you</span>
              <span>/Track everything</span>
            </div>
            <div
              className="mono"
              style={{
                display: "flex",
                gap: "48px",
                padding: "18px 24px",
                fontSize: "13px",
                color: "#8E8C86",
                whiteSpace: "nowrap",
              }}
            >
              <span>/Greenhouse</span>
              <span>/Lever</span>
              <span>/Workday</span>
              <span>/Ashby</span>
              <span>/SmartRecruiters</span>
              <span>/Keka</span>
              <span>/Stripe</span>
              <span>/Goldman Sachs</span>
              <span>/Parse every JD</span>
              <span>/Score your fit</span>
              <span>/Write like you</span>
              <span>/Track everything</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== MANIFESTO SECTION ===================== */}
      <section
        style={{
          maxWidth: "1160px",
          margin: "0 auto",
          padding: "160px 24px 120px",
          boxSizing: "border-box",
        }}
      >
        <p
          className="reveal"
          style={{
            margin: 0,
            fontSize: "clamp(26px, 3.6vw, 48px)",
            lineHeight: 1.28,
            letterSpacing: "-0.02em",
            fontWeight: 400,
          }}
        >
          Most job searches fail at the same place: the pile. Hundreds of postings, one resume, and no way to tell which roles deserve your evening. JobCopilot reads each description against your resume, tells you where you stand, and writes the first draft, so your effort goes where it counts.
        </p>
        <div
          className="mono"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px 32px",
            marginTop: "56px",
            fontSize: "15px",
            color: "#8E8C86",
          }}
        >
          <span>/One resume</span>
          <span>/Every board</span>
          <span>/Honest scores</span>
          <span>/No busywork</span>
        </div>
      </section>

      {/* ===================== HOW IT WORKS: FAN CARDS ===================== */}
      <section
        id="how"
        style={{
          maxWidth: "1240px",
          margin: "0 auto",
          padding: "80px 24px 140px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "64px",
        }}
      >
        <h2
          className="serif"
          style={{
            fontSize: "clamp(34px, 5vw, 64px)",
            lineHeight: 1.08,
            maxWidth: "760px",
          }}
        >
          JobCopilot reads the posting <i>the way a recruiter does.</i>
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "48px 56px", alignItems: "center" }}>
          {/* Fan Cards */}
          <div
            style={{
              flex: "1 1 460px",
              minWidth: 0,
              maxWidth: "640px",
              position: "relative",
              aspectRatio: "1 / 0.78",
            }}
          >
            <div
              className={`fc fc1 ${activeFan === 1 ? "scale-105 border-[#8C97FF] -translate-y-8 z-10" : ""}`}
              onMouseEnter={() => setActiveFan(1)}
              onMouseLeave={() => setActiveFan(null)}
            >
              <span className="mono" style={{ color: "#8C97FF", fontSize: "11px" }}>01</span>
              <div className="serif" style={{ fontSize: "26px", marginTop: "10px" }}>Skills</div>
              <div style={{ fontSize: "12px", lineHeight: 1.5, color: "#9A9890", marginTop: "8px" }}>
                Every tool and framework in the JD, matched to your resume.
              </div>
            </div>
            <div
              className={`fc fc2 ${activeFan === 2 ? "scale-105 border-[#8C97FF] -translate-y-8 z-10" : ""}`}
              onMouseEnter={() => setActiveFan(2)}
              onMouseLeave={() => setActiveFan(null)}
            >
              <span className="mono" style={{ color: "#8C97FF", fontSize: "11px" }}>02</span>
              <div className="serif" style={{ fontSize: "26px", marginTop: "10px" }}>Experience</div>
              <div style={{ fontSize: "12px", lineHeight: 1.5, color: "#9A9890", marginTop: "8px" }}>
                Projects and internships weighed against the seniority asked.
              </div>
            </div>
            <div
              className={`fc fc3 ${activeFan === 3 ? "scale-105 border-[#8C97FF] -translate-y-8 z-10" : ""}`}
              onMouseEnter={() => setActiveFan(3)}
              onMouseLeave={() => setActiveFan(null)}
            >
              <span className="mono" style={{ color: "#8C97FF", fontSize: "11px" }}>03</span>
              <div className="serif" style={{ fontSize: "26px", marginTop: "10px" }}>Role fit</div>
              <div style={{ fontSize: "12px", lineHeight: 1.5, color: "#9A9890", marginTop: "8px" }}>
                Whether the day-to-day work is the work you want.
              </div>
            </div>
            <div
              className={`fc fc4 ${activeFan === 4 ? "scale-105 border-[#8C97FF] -translate-y-8 z-10" : ""}`}
              onMouseEnter={() => setActiveFan(4)}
              onMouseLeave={() => setActiveFan(null)}
            >
              <span className="mono" style={{ color: "#8C97FF", fontSize: "11px" }}>04</span>
              <div className="serif" style={{ fontSize: "26px", marginTop: "10px" }}>Gaps</div>
              <div style={{ fontSize: "12px", lineHeight: 1.5, color: "#9A9890", marginTop: "8px" }}>
                What is missing, and how to address it before you apply.
              </div>
            </div>
            <div
              className={`fc fc5 ${activeFan === 5 ? "scale-105 border-[#8C97FF] -translate-y-8 z-10" : ""}`}
              onMouseEnter={() => setActiveFan(5)}
              onMouseLeave={() => setActiveFan(null)}
            >
              <span className="mono" style={{ color: "#8C97FF", fontSize: "11px" }}>05</span>
              <div className="serif" style={{ fontSize: "26px", marginTop: "10px" }}>Keywords</div>
              <div style={{ fontSize: "12px", lineHeight: 1.5, color: "#9A9890", marginTop: "8px" }}>
                The phrases an ATS filter will look for in your resume.
              </div>
            </div>
          </div>

          {/* Sample Recruiter Card */}
          <div
            className="glass"
            style={{
              flex: "1 1 340px",
              maxWidth: "420px",
              padding: "28px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              boxSizing: "border-box",
            }}
          >
            <span className="mono" style={{ color: "#8E8C86" }}>Fit report · sample</span>
            <div className="serif" style={{ fontSize: "38px", lineHeight: 1.05 }}>
              Backend Engineer Intern
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
              <span className="serif" style={{ fontSize: "72px", lineHeight: 1, color: "#8C97FF" }}>91</span>
              <span style={{ fontSize: "14px", color: "#B4B1A9" }}>Strong match. Worth applying today.</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                  <span>Skills</span>
                  <span className="mono" style={{ fontSize: "12px" }}>94%</span>
                </div>
                <div style={{ height: "4px", borderRadius: "4px", background: "rgba(255,255,255,0.1)" }}>
                  <div style={{ height: "4px", width: "94%", borderRadius: "4px", background: "#8C97FF" }} />
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                  <span>Experience</span>
                  <span className="mono" style={{ fontSize: "12px" }}>88%</span>
                </div>
                <div style={{ height: "4px", borderRadius: "4px", background: "rgba(255,255,255,0.1)" }}>
                  <div style={{ height: "4px", width: "88%", borderRadius: "4px", background: "#8C97FF" }} />
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                  <span>Role fit</span>
                  <span className="mono" style={{ fontSize: "12px" }}>96%</span>
                </div>
                <div style={{ height: "4px", borderRadius: "4px", background: "rgba(255,255,255,0.1)" }}>
                  <div style={{ height: "4px", width: "96%", borderRadius: "4px", background: "#8C97FF" }} />
                </div>
              </div>
            </div>
            <p className="serif" style={{ fontSize: "20px", lineHeight: 1.35, color: "#D8D4CA", margin: 0 }}>
              <i>&quot;Lead with your retrieval work. It is the closest match to their stack.&quot;</i>
            </p>
            <Link className="pill pill-c" href="/" style={{ alignSelf: "flex-start" }}>
              Open a live report <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== COVER LETTER ANNOTATION ===================== */}
      <section
        id="report"
        style={{
          maxWidth: "1240px",
          margin: "0 auto",
          padding: "40px 24px 160px",
          boxSizing: "border-box",
          display: "flex",
          flexWrap: "wrap",
          gap: "56px",
          alignItems: "center",
        }}
      >
        <div style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: "28px" }}>
          <span className="mono" style={{ color: "#8C97FF" }}>/ Step 02 · Write</span>
          <h2 className="serif" style={{ fontSize: "clamp(34px, 4.6vw, 60px)", lineHeight: 1.08 }}>
            Your cover letter, <i>reviewed line by line.</i>
          </h2>
          <p style={{ margin: 0, fontSize: "17px", lineHeight: 1.6, color: "#B4B1A9", maxWidth: "460px" }}>
            Every draft is built from your own projects and the language of the posting, then annotated, so you can see why each sentence is there before you send it.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "460px" }}>
            <div style={{ display: "flex", gap: "14px", paddingTop: "14px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <span className="mono" style={{ color: "#8C97FF", flex: "0 0 28px" }}>01</span>
              <span style={{ fontSize: "15px", lineHeight: 1.5 }}>Mirrors the vocabulary of the job description.</span>
            </div>
            <div style={{ display: "flex", gap: "14px", paddingTop: "14px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <span className="mono" style={{ color: "#8C97FF", flex: "0 0 28px" }}>02</span>
              <span style={{ fontSize: "15px", lineHeight: 1.5 }}>Pulls evidence only from your parsed resume.</span>
            </div>
            <div style={{ display: "flex", gap: "14px", paddingTop: "14px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <span className="mono" style={{ color: "#8C97FF", flex: "0 0 28px" }}>03</span>
              <span style={{ fontSize: "15px", lineHeight: 1.5 }}>Reads human, not templated. Edit anything before you copy.</span>
            </div>
          </div>
        </div>

        {/* Live Annotated Card */}
        <div
          style={{
            flex: "1 1 460px",
            minWidth: 0,
            position: "relative",
            borderRadius: "22px",
            padding: "2px",
            background:
              "linear-gradient(140deg, #5B6BFF, rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.04))",
          }}
        >
          <div
            style={{
              background: "#0A0B0F",
              borderRadius: "20px",
              padding: "32px",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="mono" style={{ color: "#8E8C86" }}>Cover letter · draft 1</span>
              <span className="tag mono" style={{ fontSize: "11px" }}>Annotated Sample</span>
            </div>
            <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.75, color: "#D8D4CA" }}>
              Hi Northwind team, I&apos;m applying for the Backend Engineer Intern role. Your retrieval service sits close to the work I have been doing:{" "}
              <span style={{ background: "rgba(91,107,255,0.28)", borderRadius: "4px", padding: "1px 4px", color: "#FFFFFF" }}>
                building a retrieval pipeline with LangChain and FastAPI that answers questions over a private document set
              </span>.
            </p>
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "flex-start",
                background: "rgba(91,107,255,0.1)",
                border: "1px solid rgba(140,151,255,0.35)",
                borderRadius: "12px",
                padding: "12px 14px",
              }}
            >
              <span className="mono" style={{ color: "#8C97FF", fontSize: "11px", flex: "0 0 auto", paddingTop: "2px" }}>Why</span>
              <span style={{ fontSize: "13px", lineHeight: 1.5, color: "#C9CCFF" }}>
                Matches the JD&apos;s &quot;retrieval services&quot; requirement with a project from your resume.
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.75, color: "#D8D4CA" }}>
              I like that the team ships{" "}
              <span style={{ background: "rgba(255,200,97,0.2)", borderRadius: "4px", padding: "1px 4px", color: "#FFFFFF" }}>
                small services with clear owners
              </span>. That is how I structure my own backend work, and I would like to learn it at your scale.
            </p>
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "flex-start",
                background: "rgba(255,200,97,0.08)",
                border: "1px solid rgba(255,200,97,0.35)",
                borderRadius: "12px",
                padding: "12px 14px",
              }}
            >
              <span className="mono" style={{ color: "#FFC861", fontSize: "11px", flex: "0 0 auto", paddingTop: "2px" }}>Tip</span>
              <span style={{ fontSize: "13px", lineHeight: 1.5, color: "#FFE2A8" }}>
                Add one concrete result here if you have it. Hiring managers remember numbers.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== RADAR ORB SECTION ===================== */}
      <section
        style={{
          position: "relative",
          maxWidth: "1240px",
          margin: "0 auto",
          padding: "40px 24px 160px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "640px", marginBottom: "40px" }}>
          <span className="mono" style={{ color: "#8C97FF" }}>/ Always on</span>
          <h2 className="serif" style={{ fontSize: "clamp(34px, 4.6vw, 60px)", lineHeight: 1.08 }}>
            One pipeline, <i>watching every board.</i>
          </h2>
        </div>
        <div style={{ position: "relative", minHeight: "560px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div aria-hidden="true" style={{ position: "relative", width: "min(100%, 520px)", aspectRatio: "1 / 1" }}>
            <div
              className="dots"
              style={{
                position: "absolute",
                inset: 0,
                maskImage: "radial-gradient(circle at 50% 50%, #000 0%, #000 52%, transparent 70%)",
                WebkitMaskImage: "radial-gradient(circle at 50% 50%, #000 0%, #000 52%, transparent 70%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "12%",
                right: "12%",
                top: 0,
                bottom: 0,
                overflow: "hidden",
                borderRadius: "50%",
                maskImage: "radial-gradient(circle, #000 55%, transparent 70%)",
                WebkitMaskImage: "radial-gradient(circle, #000 55%, transparent 70%)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: "18%",
                  background: "linear-gradient(180deg, transparent, rgba(140,151,255,0.55), transparent)",
                  animation: "scan 5s ease-in-out infinite",
                }}
              />
            </div>
          </div>

          {/* Floating chips */}
          <div
            className="glass chip"
            style={{
              position: "absolute",
              left: "4%",
              top: "12%",
              padding: "12px 16px",
              display: "flex",
              gap: "10px",
              alignItems: "center",
              background: "#11131A",
            }}
          >
            <span style={{ width: "8px", height: "8px", borderRadius: "99px", background: "#5EEAA8" }} />
            <span style={{ fontSize: "13px" }}>Resume parsed</span>
          </div>

          <div
            className="glass chip"
            style={{
              position: "absolute",
              right: "4%",
              top: "26%",
              padding: "12px 16px",
              background: "#11131A",
              animationDelay: "-2s",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span className="mono" style={{ fontSize: "11px", color: "#8E8C86" }}>New lead</span>
            <span style={{ fontSize: "13px" }}>AI Engineer Intern · Fit 88</span>
          </div>

          <div
            className="glass chip"
            style={{
              position: "absolute",
              left: "8%",
              bottom: "14%",
              padding: "12px 16px",
              background: "#11131A",
              animationDelay: "-4s",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span className="mono" style={{ fontSize: "11px", color: "#8E8C86" }}>Digest</span>
            <span style={{ fontSize: "13px" }}>3 new matches since yesterday</span>
          </div>

          <div
            className="mono"
            style={{
              position: "absolute",
              right: "2%",
              top: "4%",
              maxWidth: "220px",
              fontSize: "12px",
              lineHeight: 1.5,
              color: "#C9C6BE",
              borderTop: "1px solid rgba(255,255,255,0.3)",
              paddingTop: "10px",
            }}
          >
            Scores every posting before you read it
          </div>

          <div
            className="mono"
            style={{
              position: "absolute",
              right: "2%",
              bottom: "20%",
              maxWidth: "220px",
              fontSize: "12px",
              lineHeight: 1.5,
              color: "#8E8C86",
              borderTop: "1px solid rgba(255,255,255,0.2)",
              paddingTop: "10px",
            }}
          >
            Fills applications through the Chrome extension
          </div>

          <div
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              maxWidth: "280px",
            }}
          >
            <span className="tag mono" style={{ alignSelf: "flex-start" }}>In your pipeline</span>
            <div
              style={{
                background: "#2F3DFF",
                border: "1px solid rgba(255,255,255,0.4)",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div className="mono" style={{ fontSize: "11px", display: "flex", justifyContent: "space-between", gap: "16px" }}>
                <span>Boards</span>
                <span>Greenhouse · Lever · Workday</span>
              </div>
              <div className="mono" style={{ fontSize: "11px", display: "flex", justifyContent: "space-between", gap: "16px" }}>
                <span>Extension</span>
                <span>Chrome v2.4</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== FEATURES MATRIX ===================== */}
      <section
        id="features"
        style={{
          maxWidth: "1240px",
          margin: "0 auto",
          padding: "0 24px 160px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "56px",
        }}
      >
        <h2
          className="serif"
          style={{
            fontSize: "clamp(34px, 5vw, 64px)",
            lineHeight: 1.08,
            maxWidth: "760px",
          }}
        >
          Everything between <i>post</i> and <i>offer.</i>
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
          {FEATURES.map((f) => (
            <Link
              key={f.kicker}
              href={f.href}
              className="glass card"
              style={{
                flex: "1 1 340px",
                minWidth: 0,
                boxSizing: "border-box",
                padding: "28px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                minHeight: "220px",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span className="mono" style={{ color: "#8C97FF" }}>{f.kicker}</span>
              <span className="serif" style={{ fontSize: "32px", lineHeight: 1.1 }}>{f.title}</span>
              <span style={{ fontSize: "15px", lineHeight: 1.55, color: "#B4B1A9", flex: 1 }}>{f.body}</span>
              <span className="mono" style={{ fontSize: "12px", color: "#F3EFE7" }}>
                Open <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ===================== CLOSING CTA ===================== */}
      <section
        style={{
          position: "relative",
          textAlign: "center",
          padding: "140px 24px 160px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: "720px",
            height: "360px",
            transform: "translateX(-50%)",
            background: "radial-gradient(ellipse at 50% 0%, rgba(91,107,255,0.28), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "32px",
          }}
        >
          <h2 className="serif" style={{ fontSize: "clamp(40px, 7vw, 92px)", lineHeight: 1.03 }}>
            Your next role is <i>already posted.</i>
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "center" }}>
            <Link className="pill pill-c" href="/">
              Open the app <span aria-hidden="true">→</span>
            </Link>
            <Link className="pill pill-g" href="/inbox">
              Paste your first leads <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "56px 24px 48px" }}>
        <div
          style={{
            maxWidth: "1240px",
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            gap: "40px 64px",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "320px" }}>
            <span style={{ fontSize: "18px", fontWeight: 600, letterSpacing: "-0.02em" }}>JobCopilot</span>
            <span style={{ fontSize: "14px", lineHeight: 1.55, color: "#8E8C86" }}>
              Analyze job descriptions, score your fit, and write applications that sound like you.
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "40px 72px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span className="mono" style={{ color: "#8E8C86" }}>Product</span>
              <Link href="/" style={{ fontSize: "14px", color: "#C9C6BE" }}>Jobs Feed</Link>
              <Link href="/tracker" style={{ fontSize: "14px", color: "#C9C6BE" }}>Tracker</Link>
              <Link href="/resumes" style={{ fontSize: "14px", color: "#C9C6BE" }}>Resume Vault</Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span className="mono" style={{ color: "#8E8C86" }}>Tools</span>
              <Link href="/coach" style={{ fontSize: "14px", color: "#C9C6BE" }}>AI Career Coach</Link>
              <Link href="/companies" style={{ fontSize: "14px", color: "#C9C6BE" }}>ATS Boards</Link>
              <Link href="/settings" style={{ fontSize: "14px", color: "#C9C6BE" }}>Extension</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
