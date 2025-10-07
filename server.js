const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Global variable to store the current motivational letter
let currentMotivationalLetter = null;

// Global variable to store the current mock interview session
let currentMockInterview = null;

// Personal information cache (used to augment AI prompts)
let personalInfoCache = null;
function loadPersonalInformation() {
  if (personalInfoCache !== null) return personalInfoCache;
  try {
    const infoPath = path.join(__dirname, 'personal information.txt');
    if (fs.existsSync(infoPath)) {
      personalInfoCache = fs.readFileSync(infoPath, 'utf8');
    } else {
      personalInfoCache = '';
    }
  } catch (e) {
    personalInfoCache = '';
  }
  return personalInfoCache;
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// LLM Configuration
const LLM_CONFIG = {
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'mistralai/mixtral-8x7b-instruct', // Reliable free model on OpenRouter
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY || ''}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3001',
      'X-Title': 'LaTeX CV Optimizer'
    }
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    model: 'llama3-70b-8192',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    }
  }
};

// Default CV template (your main.tex)
const DEFAULT_CV_TEMPLATE = `\\documentclass[10pt, letterpaper]{article}

% Packages:
\\usepackage[
    ignoreheadfoot, % set margins without considering header and footer
    top=2 cm, % seperation between body and page edge from the top
    bottom=2 cm, % seperation between body and page edge from the bottom
    left=2 cm, % seperation between body and page edge from the left
    right=2 cm, % seperation between body and page edge from the right
    footskip=1.0 cm, % seperation between body and footer
    % showframe % for debugging 
]{geometry} % for adjusting page geometry
\\usepackage{titlesec} % for customizing section titles
\\usepackage{tabularx} % for making tables with fixed width columns
\\usepackage{fontawesome5}

\\usepackage{array} % tabularx requires this
\\usepackage[dvipsnames]{xcolor} % for coloring text
\\definecolor{primaryColor}{RGB}{0, 0, 0} % define primary color
\\usepackage{enumitem} % for customizing lists
\\usepackage{fontawesome5} % for using icons
\\usepackage{amsmath} % for math
\\usepackage[
    pdftitle={Abdelrahman Ali Elnagar's CV},
    pdfauthor={Abdelrahman Ali Elnagar},
    pdfcreator={LaTeX with RenderCV},
    colorlinks=true,
    urlcolor=primaryColor
]{hyperref} % for links, metadata and bookmarks
\\usepackage[pscoord]{eso-pic} % for floating text on the page
\\usepackage{calc} % for calculating lengths
\\usepackage{bookmark} % for bookmarks
\\usepackage{lastpage} % for getting the total number of pages
\\usepackage{changepage} % for one column entries (adjustwidth environment)
\\usepackage{paracol} % for two and three column entries
\\usepackage{ifthen} % for conditional statements
\\usepackage{needspace} % for avoiding page brake right after the section title
\\usepackage{iftex} % check if engine is pdflatex, xetex or luatex
% Ensure that generate pdf is machine readable/ATS parsable:
\\ifPDFTeX
    \\input{glyphtounicode}
    \\pdfgentounicode=1
    \\usepackage[T1]{fontenc}
    \\usepackage[utf8]{inputenc}
    \\usepackage{lmodern}
\\fi

\\usepackage{charter}

% Some settings:
\\raggedright
\\AtBeginEnvironment{adjustwidth}{\\partopsep0pt} % remove space before adjustwidth environment
\\pagestyle{empty} % no header or footer
\\setcounter{secnumdepth}{0} % no section numbering
\\setlength{\\parindent}{0pt} % no indentation
\\setlength{\\topskip}{0pt} % no top skip
\\setlength{\\columnsep}{0.15cm} % set column seperation
\\pagenumbering{gobble} % no page numbering

\\titleformat{\\section}{\\needspace{4\\baselineskip}\\bfseries\\large}{}{0pt}{}[\\vspace{1pt}\\titlerule]

\\titlespacing{\\section}{
    % left space:
    -1pt
}{
    % top space:
    0.3 cm
}{
    % bottom space:
    0.2 cm
} % section title spacing

\\renewcommand\\labelitemi{$\\vcenter{\\hbox{\\small$\\bullet$}}$} % custom bullet points
\\newenvironment{highlights}{
    \\begin{itemize}[
        topsep=0.10 cm,
        parsep=0.10 cm,
        partopsep=0pt,
        itemsep=0pt,
        leftmargin=0 cm + 10pt
    ]
}{
    \\end{itemize}
} % new environment for highlights


\\newenvironment{highlightsforbulletentries}{
    \\begin{itemize}[
        topsep=0.10 cm,
        parsep=0.10 cm,
        partopsep=0pt,
        itemsep=0pt,
        leftmargin=10pt
    ]
}{
    \\end{itemize}
} % new environment for highlights for bullet entries

\\newenvironment{onecolentry}{
    \\begin{adjustwidth}{
        0 cm + 0.00001 cm
    }{
        0 cm + 0.00001 cm
    }
}{
    \\end{adjustwidth}
} % new environment for one column entries

\\newenvironment{twocolentry}[2][]{
    \\onecolentry
    \\def\\secondColumn{#2}
    \\setcolumnwidth{\\fill, 4.5 cm}
    \\begin{paracol}{2}
}{
    \\switchcolumn \\raggedleft \\secondColumn
    \\end{paracol}
    \\endonecolentry
} % new environment for two column entries

\\newenvironment{threecolentry}[3][]{
    \\onecolentry
    \\def\\thirdColumn{#3}
    \\setcolumnwidth{, \\fill, 4.5 cm}
    \\begin{paracol}{3}
    {\\raggedright #2} \\switchcolumn
}{
    \\switchcolumn \\raggedleft \\thirdColumn
    \\end{paracol}
    \\endonecolentry
} % new environment for three column entries

\\newenvironment{header}{
    \\setlength{\\topsep}{0pt}\\par\\kern\\topsep\\centering\\linespread{1.5}
}{
    \\par\\kern\\topsep
} % new environment for the header

\\newcommand{\\placelastupdatedtext}{% \\placetextbox{<horizontal pos>}{<vertical pos>}{<stuff>}
  \\AddToShipoutPictureFG*{% Add <stuff> to current page foreground
    \\put(
        \\LenToUnit{\\paperwidth-2 cm-0 cm+0.05cm},
        \\LenToUnit{\\paperheight-1.0 cm}
    ){\\vtop{{\\null}\\makebox[0pt][c]{
        \\small\\color{gray}\\textit{Last updated in August 2025}\\hspace{\\widthof{Last updated in August 2025}}
    }}}%
  }%
}%

% save the original href command in a new command:
\\let\\hrefWithoutArrow\\href

% new command for external links:


\\begin{document}
    \\newcommand{\\AND}{\\unskip
        \\cleaders\\copy\\ANDbox\\hskip\\wd\\ANDbox
        \\ignorespaces
    }
    \\newsavebox\\ANDbox
    \\sbox\\ANDbox{$|$}

    \\begin{header}
        \\fontsize{25 pt}{25 pt}\\selectfont Abdelrahman Ali Elnagar

        \\vspace{5 pt}

        \\normalsize
        \\mbox{Ulm, Germany}%
        \\kern 5.0 pt%
        \\AND%
        \\kern 5.0 pt%
        \\mbox{\\hrefWithoutArrow{mailto:abdelrahmanelnagar123@gmail.com}{abdelrahmanelnagar123@gmail.com}}%
        \\kern 5.0 pt%
        \\AND%
        \\kern 5.0 pt%
        \\mbox{\\hrefWithoutArrow{tel:+49-15237095469}{+49 15237095469}}%
        \\kern 5.0 pt%
        \\AND%
        \\kern 5.0 pt%
        \\mbox{\\hrefWithoutArrow{https://abdelrahman-elnagar.my.canva.site}{Portfolio}}%
        \\kern 5.0 pt%
        \\AND%
        \\kern 5.0 pt%
        \\mbox{\\hrefWithoutArrow{https://linkedin.com/in/abdelrahman-elnagar}{LinkedIn}}%
        \\kern 5.0 pt%
        \\AND%
        \\kern 5.0 pt%
        \\mbox{\\hrefWithoutArrow{https://github.com/Abdelrahman-Elnagar}{GitHub}}%
    \\end{header}

    \\vspace{5 pt - 0.3 cm}

    \\section{Education}

        \\begin{twocolentry}{
            Currently Ongoing
        }
            \\textbf{Technische Hochschule Ulm (THU)}, Bachelor Thesis -- Germany\\end{twocolentry}

        \\vspace{0.10 cm}
        \\begin{onecolentry}
            \\begin{highlights}
                \\item Nominated for top-ranking student thesis in deep learning application for the energy market
                \\item Enrolled at THU with authorization for internship engagements across Germany
            \\end{highlights}
        \\end{onecolentry}

        \\vspace{0.2 cm}

        \\begin{twocolentry}{
            2022 – 2025
        }
            \\textbf{German International University (GIU)}, B.Sc. in Computer Science (Data Science)\\end{twocolentry}

        \\vspace{0.10 cm}
        \\begin{onecolentry}
            \\begin{highlights}
                \\item Top 10 of 300+ students with A+ grade
                \\item Minor in Software Engineering
                \\item Full scholarship recipient for B.Sc. studies
                \\item Consistently top 10 in university semester ranks
            \\end{highlights}
        \\end{onecolentry}

        \\vspace{0.2 cm}

        \\begin{twocolentry}{
            Graduated
        }
            \\textbf{Thanaweya Amma Secondary School}, High School Diploma\\end{twocolentry}

        \\vspace{0.10 cm}
        \\begin{onecolentry}
            \\begin{highlights}
                \\item Ranked 5th nationwide among 700,000+ students with A+ grade
                \\item Consistently top 10 in class throughout all years of study
            \\end{highlights}
        \\end{onecolentry}

    \\section{Experience}

        \\begin{twocolentry}{
            June 2025 – Present
        }
            \\textbf{AI Engineer}, BSA\\end{twocolentry}

        \\vspace{0.10 cm}
        \\begin{onecolentry}
            \\begin{highlights}
                \\item Building Machine Learning Models for architectural design verification
                \\item Architectural dataset collection \\& labeling; ML model training \\& deployment on Blender-rendered images
                \\item Developed modular ML pipeline: image preprocessing, object detection, color/spatial analysis, pattern matching
                \\item MLOps \\& scalable API infrastructure design; production deployment management
                \\item Full-lifecycle project leadership for Saudi Government: team management, client engagements, proposals \\& negotiations
                \\item Jira-based project management: coordinated backend, frontend, UI/UX, security \\& ML teams
            \\end{highlights}
        \\end{onecolentry}

        \\vspace{0.2 cm}

        \\begin{twocolentry}{
            Oct 2023 – June 2025
        }
            \\textbf{Junior Teaching Assistant}, German International University\\end{twocolentry}

        \\vspace{0.10 cm}
        \\begin{onecolentry}
            \\begin{highlights}
                \\item Provided Java programming, theoretical computation   support and coached 60+ students
                \\item Role concluded upon course completion
            \\end{highlights}
        \\end{onecolentry}

\\section{Projects}
        \\begin{twocolentry}{
            AI Projects
        }
            \\textbf{Machine Learning \\& AI Applications}\\end{twocolentry}
        \\vspace{0.10 cm}
        \\begin{onecolentry}
            \\begin{highlights}
                \\item \\href{https://tintern-client.fly.dev/auth/login}{RAG Chatbot for Job seeking website $\\scriptscriptstyle\\nearrow$}
                \\item {CNN-RNN pipeline for image captioning}
                \\item \\href{https://github.com/username/edge-computing}{Edge computing for image processing $\\scriptscriptstyle\\nearrow$}
                \\item {Facial sentimental analyzer}
                \\item \\href{https://colab.research.google.com/drive/1RsQSTjeqqu1ld_p_izogjOq9LzKfr6m2?usp=sharing}{Traffic sign detector $\\scriptscriptstyle\\nearrow$}
            \\end{highlights}
        \\end{onecolentry}
        \\vspace{0.2 cm}
        \\begin{twocolentry}{
            Full Stack
        }
            \\textbf{Web Development \\& Software Engineering}\\end{twocolentry}
        \\vspace{0.10 cm}
        \\begin{onecolentry}
            \\begin{highlights}
                \\item \\href{https://github.com/Elite-GIU}{E-Learning Platform – NestJS, MongoDB, Next.js $\\scriptscriptstyle\\nearrow$}
                \\item \\href{https://github.com/Abdelrahman-Elnagar/UI_Refactoring/tree/main}{Governmental open contribution UI Refactor – SRS, Figma, React, User Interface analysis $\\scriptscriptstyle\\nearrow$}
                \\item \\href{https://github.com/Abdelrahman-Elnagar/Balabizo-Programming-Language}{Interpreter for Custom Programming Language – Java, Parsers, Compiler Design $\\scriptscriptstyle\\nearrow$}
                \\item \\href{https://github.com/Abdelrahman-Elnagar/Operating_System_demo}{Demo for Operating System - Java, Process, Memory Management, Scheduling Algorithms, Execution Simulation}
                \\item \\href{https://github.com/Abdelrahman-Elnagar/The-Last-Of-Us}{"The Last of Us" Game – JavaFX, OOP, AI $\\scriptscriptstyle\\nearrow$}
                \\item {MPC Football Transfer – MP-SPDZ, JavaFX, LINDDUN, Encryption}
                \\item \\href{https://github.com/MohamedHossam2004/Porsche}{Porsche E-Commerce App – NodeJS, React, Redis $\\scriptscriptstyle\\nearrow$}
                \\item \\href{https://github.com/Abdelrahman-Elnagar/Server-Client-Chat-Application}{Multi-threaded Chat App – Java, TCP/IP $\\scriptscriptstyle\\nearrow$}
                \\item \\href{https://github.com/Abdelrahman-Elnagar/InfinitySystems}{Smart Home App – NodeJS, React, .NET Core MVC, C\\# $\\scriptscriptstyle\\nearrow$}
                \\item \\href{https://production.d1rel1zoj4hes1.amplifyapp.com/}{Task Management System with AWS Amplify and all other main AWS services $\\scriptscriptstyle\\nearrow$}
                \\item \\href{https://tintern-client.fly.dev/auth/login}{Tintern Job seeking website - NestJs, NextJs, MongoDB, RAG chatbot $\\scriptscriptstyle\\nearrow$}
            \\end{highlights}
        \\end{onecolentry}


    \\section{Technical Skills}

        \\begin{onecolentry}
            \\textbf{Programming Languages:} Python, Java, C++, JavaScript, TypeScript, C\\#, MIPS, Julia, R
        \\end{onecolentry}

        \\vspace{0.2 cm}

        \\begin{onecolentry}
            \\textbf{Databases:} SQL, MongoDB, Redis, PostgreSQL, PostGIS, Cassandra
        \\end{onecolentry}

        \\vspace{0.2 cm}

        \\begin{onecolentry}
            \\textbf{Frameworks \\& Libraries:} NestJS, NextJS, NodeJS, Express, React, .NET, Hadoop, Spark, MP-SPDZ, Apache Airflow, Pandas, NumPy, Scikit-learn, Seaborn, Matplotlib, Vuforia, JavaFX
        \\end{onecolentry}

        \\vspace{0.2 cm}

        \\begin{onecolentry}
            \\textbf{Tools \\& Technologies:} Git/GitHub, Power BI, Tableau, Linux, AWS Services, Amplify, Jira
        \\end{onecolentry}

    \\section{Languages \\& Additional Skills}

        \\begin{onecolentry}
            \\textbf{Languages:} Arabic (Native), English (Fluent), German (A2, currently studying B1)
        \\end{onecolentry}

        \\vspace{0.2 cm}

        \\begin{onecolentry}
            \\textbf{Soft Skills:} Excellent communicator, Fast learner, Highly adaptive, Strong interest in academic research, Interests in data privacy Laws like GDPR and EPL 151
        \\end{onecolentry}

\\section{Proof of skill}

\\href{https://github.com/Abdelrahman-Elnagar/UI_Refactoring/tree/main}{UI Design and Software Documentation $\\scriptscriptstyle\\nearrow$} \\\\
\\href{https://github.com/Abdelrahman-Elnagar/Visulization_Project/blob/main/Visualization_M1_Final.ipynb}{Data Analysis, Engineering $\\scriptscriptstyle\\nearrow$} \\\\
\\href{https://github.com/Abdelrahman-Elnagar/Visulization_Project/blob/main/Visualization_M1_Final.ipynb}{Data Visualization $\\scriptscriptstyle\\nearrow$} \\\\
\\href{https://github.com/Abdelrahman-Elnagar/System_Design/tree/main}{System Design $\\scriptscriptstyle\\nearrow$} \\\\
\\href{https://github.com/Abdelrahman-Elnagar/Query_Optimization/tree/main}{Query Optimization $\\scriptscriptstyle\\nearrow$} \\\\

    \\section{Achievements \\& Participations}

        \\begin{onecolentry}
            \\begin{highlightsforbulletentries}
                \\item 3rd place – GIU Exceed Hackathon (IEEE)
                \\item 1st place in 2 Kaggle ML Competitions
                \\item 2nd place – Neonatal Hydrocephalus tech competition
                \\item DAAD Scholarship for Bachelor thesis in Germany
                \\item Dior-GIU collaboration implement digital garments in the virtual VR and physical world
                \\item Kaggle's Competitions for ML models secured the 1st place in 2 competitions
                \\item GIU Privacy-Awareness Hackathon
                \\item 200+ problems solved on Codeforces and Leetcode
                \\item ICPC International Collegiate Programming Contest participant
                \\item Private-Eye Project Workshop – GDPR \\& LINDDUN, Ulm University, Germany (Feb 2024)
                \\item HackApp Hackathon – MP-SPDZ MPC Application, Ulm University, Germany (Jul 2024)
                \\item Represented GIU during German President visit to Cairo, Egypt
                \\item Represented GIU during the International accreditation of GIU in Germany
                \\item GIU feedback community member, collecting feedback from 200+ students
            \\end{highlightsforbulletentries}
        \\end{onecolentry}
\\end{document}`;

// Resilient LLM API call function with fallback
async function callLLM(prompt, provider = 'openrouter', maxRetries = 3) {
  const providers = ['openrouter', 'groq'];
  let currentProvider = provider;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const config = LLM_CONFIG[currentProvider];
      if (!config) {
        throw new Error(`Provider ${currentProvider} not supported`);
      }

      console.log(`LLM | 🔄 Attempt ${attempt}/${maxRetries} - Calling LLM with model: ${config.model}`);
      console.log(`LLM | 🌐 API URL: ${config.baseURL}/chat/completions`);
      
      const authHeader = config.headers?.Authorization || '';
      const hasBearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') && authHeader.trim().length > 'Bearer '.length;
      if (!hasBearer) {
        throw new Error(`Missing API key for provider ${currentProvider}. Configure via /api/configure or set environment variable.`);
      }

      const response = await axios.post(`${config.baseURL}/chat/completions`, {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert AI workflow specializing in LaTeX CV optimization and job-specific tailoring. You must be deterministic, factual, and explainable. Your purpose is to take a job description and an existing LaTeX CV, then generate a new LaTeX CV perfectly aligned to the job without fabricating or altering factual data.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      }, {
        headers: config.headers,
        timeout: 30000 // 30 second timeout
      });

      console.log('LLM | ✅ LLM Response received successfully');
      return response.data.choices[0].message.content;
    } catch (error) {
      lastError = error;
      console.error(`LLM | ❌ Attempt ${attempt} failed:`, error.message);
      console.error('LLM | Status:', error.response?.status);
      console.error('LLM | Status Text:', error.response?.statusText);
      console.error('LLM | Response Data:', error.response?.data);
      
      // If this is not the last attempt, try switching providers
      if (attempt < maxRetries) {
        const currentIndex = providers.indexOf(currentProvider);
        const nextProvider = providers[(currentIndex + 1) % providers.length];
        console.log(`LLM | 🔄 Switching from ${currentProvider} to ${nextProvider} for next attempt`);
        currentProvider = nextProvider;
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  // If all attempts failed, throw the last error
  console.error('LLM | 💥 All LLM attempts failed');
  throw new Error(`LLM API call failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

// Parse job description
async function parseJobDescription(jobDescription) {
  const prompt = `Parse this job description and extract structured data in JSON format:

JOB DESCRIPTION:
${jobDescription}

Extract and return ONLY a JSON object with these fields:
{
  "role_title": "extracted job title",
  "core_responsibilities": ["list of main responsibilities"],
  "required_skills": ["list of required technical skills"],
  "preferred_skills": ["list of preferred skills"],
  "keywords": ["important keywords and phrases"],
  "seniority": "junior/mid/senior/lead",
  "location": "job location if mentioned",
  "company_type": "startup/corporate/tech/consulting/etc"
}

CRITICAL: Return ONLY the JSON object. Do not include any explanatory text, comments, or additional content. Start your response with { and end with }.`;

  const result = await callLLM(prompt);
  try {
    // Clean the response to extract only JSON
    const cleanedResult = result.trim();
    const jsonStart = cleanedResult.indexOf('{');
    const jsonEnd = cleanedResult.lastIndexOf('}') + 1;
    
    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error('No valid JSON found in response');
    }
    
    const jsonString = cleanedResult.substring(jsonStart, jsonEnd);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to parse job description:', error);
    console.error('Raw response:', result);
    throw new Error('Failed to parse job description');
  }
}

// Parse CV content
async function parseCVContent(cvContent) {
  const prompt = `Parse this LaTeX CV and extract structured data in JSON format:

CV CONTENT:
${cvContent}

Extract and return ONLY a JSON object with these fields:
{
  "header": {
    "name": "full name",
    "contact": "contact information"
  },
  "sections": {
    "education": [
      {
        "institution": "school/university name",
        "degree": "degree type and field",
        "dates": "date range",
        "achievements": ["list of achievements"]
      }
    ],
    "experience": [
      {
        "role": "job title",
        "company": "company name",
        "dates": "date range",
        "bullets": ["list of responsibilities and achievements"]
      }
    ],
    "skills": {
      "programming": ["programming languages"],
      "databases": ["database technologies"],
      "frameworks": ["frameworks and libraries"],
      "tools": ["tools and technologies"]
    },
    "projects": [
      {
        "name": "project name",
        "description": "project description",
        "technologies": ["technologies used"]
      }
    ],
    "achievements": ["list of achievements and awards"]
  }
}

CRITICAL: Return ONLY the JSON object. Do not include any explanatory text, comments, or additional content. Start your response with { and end with }.`;

  const result = await callLLM(prompt);
  try {
    // Clean the response to extract only JSON
    const cleanedResult = result.trim();
    const jsonStart = cleanedResult.indexOf('{');
    const jsonEnd = cleanedResult.lastIndexOf('}') + 1;
    
    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error('No valid JSON found in response');
    }
    
    const jsonString = cleanedResult.substring(jsonStart, jsonEnd);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to parse CV content:', error);
    console.error('Raw response:', result);
    throw new Error('Failed to parse CV content');
  }
}

// Perform gap analysis
async function performGapAnalysis(jobData, cvData) {
  const prompt = `Perform a gap analysis between this job description and CV data:

JOB DATA:
${JSON.stringify(jobData, null, 2)}

CV DATA:
${JSON.stringify(cvData, null, 2)}

Return ONLY a JSON object with these fields:
{
  "matched_keywords": ["keywords from job that match CV"],
  "missing_keywords": ["important job keywords not found in CV"],
  "suggested_rewrites": [
    {
      "original_bullet": "original CV bullet point",
      "proposed_rewrite": "rewritten version with job keywords",
      "job_trigger": "job keyword or phrase that triggered this rewrite",
      "confidence": "HIGH|MEDIUM|LOW"
    }
  ],
  "clarification_questions": ["questions about missing information"],
  "relevance_score": "percentage of job requirements covered by CV"
}

CRITICAL: Return ONLY the JSON object. Do not include any explanatory text, comments, or additional content. Start your response with { and end with }.`;

  const result = await callLLM(prompt);
  try {
    // Clean the response to extract only JSON
    const cleanedResult = result.trim();
    const jsonStart = cleanedResult.indexOf('{');
    const jsonEnd = cleanedResult.lastIndexOf('}') + 1;
    
    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error('No valid JSON found in response');
    }
    
    const jsonString = cleanedResult.substring(jsonStart, jsonEnd);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to perform gap analysis:', error);
    console.error('Raw response:', result);
    throw new Error('Failed to perform gap analysis');
  }
}

// Validate and sanitize LLM response structure
function validateLLMResponse(response, expectedStructure) {
  if (!response || typeof response !== 'object') {
    return false;
  }
  
  for (const key in expectedStructure) {
    if (!(key in response)) {
      console.warn(`Missing key in LLM response: ${key}`);
      return false;
    }
    
    if (expectedStructure[key] === 'array' && !Array.isArray(response[key])) {
      console.warn(`Expected array for key ${key}, got ${typeof response[key]}`);
      return false;
    }
    
    if (expectedStructure[key] === 'object' && typeof response[key] !== 'object') {
      console.warn(`Expected object for key ${key}, got ${typeof response[key]}`);
      return false;
    }
  }
  
  return true;
}

// Generate targeted edits for CV sections
async function generateTargetedEdits(jobData, cvData, gapAnalysis, originalCV) {
  const prompt = `Based on this job analysis, suggest ONLY ESSENTIAL targeted edits to the CV. Be very conservative - only suggest edits that are clearly beneficial and necessary.

JOB DATA:
${JSON.stringify(jobData, null, 2)}

GAP ANALYSIS:
${JSON.stringify(gapAnalysis, null, 2)}

IMPORTANT RULES:
1. Only suggest edits if there's a clear mismatch between job requirements and CV content
2. Do NOT add keywords just for the sake of adding them
3. Do NOT modify text that already matches job requirements well
4. Only suggest HIGH confidence edits that are truly necessary
5. If the CV already covers the job requirements well, return empty arrays

Return ONLY a JSON object with these fields:
{
  "section_edits": [
    {
      "section": "experience|projects|skills|education",
      "subsection": "specific subsection name",
      "original_text": "exact text to replace",
      "new_text": "replacement text with job keywords",
      "edit_type": "replace|reorder|emphasize",
      "confidence": "HIGH|MEDIUM|LOW",
      "justification": "why this edit is necessary"
    }
  ],
  "skill_additions": [
    {
      "category": "programming|databases|frameworks|tools",
      "skills_to_emphasize": ["skill1", "skill2"],
      "skills_to_add": ["new_skill1", "new_skill2"]
    }
  ],
  "project_reordering": [
    {
      "project_name": "project name",
      "new_priority": 1,
      "reason": "why this project is relevant"
    }
  ]
}

CRITICAL: Return ONLY the JSON object. If no edits are needed, return empty arrays. Do not include any explanatory text.`;

  const result = await callLLM(prompt);
  try {
    // Clean the response to extract only JSON
    const cleanedResult = result.trim();
    const jsonStart = cleanedResult.indexOf('{');
    const jsonEnd = cleanedResult.lastIndexOf('}') + 1;
    
    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error('No valid JSON found in response');
    }
    
    const jsonString = cleanedResult.substring(jsonStart, jsonEnd);
    const parsed = JSON.parse(jsonString);
    
    // Validate the response structure
    const expectedStructure = {
      section_edits: 'array',
      skill_additions: 'array',
      project_reordering: 'array'
    };
    
    if (!validateLLMResponse(parsed, expectedStructure)) {
      console.warn('LLM response structure validation failed, using fallback');
      throw new Error('Invalid response structure');
    }
    
    // Ensure arrays exist and are properly formatted
    parsed.section_edits = Array.isArray(parsed.section_edits) ? parsed.section_edits : [];
    parsed.skill_additions = Array.isArray(parsed.skill_additions) ? parsed.skill_additions : [];
    parsed.project_reordering = Array.isArray(parsed.project_reordering) ? parsed.project_reordering : [];
    
    // Filter out low confidence edits
    if (parsed.section_edits) {
      parsed.section_edits = parsed.section_edits.filter(edit => 
        edit && edit.confidence === 'HIGH' && edit.justification && edit.justification.length > 10
      );
    }
    
    console.log(`✅ Parsed ${parsed.section_edits.length} section edits, ${parsed.skill_additions.length} skill additions`);
    return parsed;
  } catch (error) {
    console.error('Failed to parse targeted edits:', error);
    console.error('Raw response:', result);
    return {
      section_edits: [],
      skill_additions: [],
      project_reordering: []
    };
  }
}

// Apply targeted edits to CV
function applyTargetedEdits(originalCV, edits) {
  let modifiedCV = originalCV;
  
  // Ensure edits object has the expected structure
  if (!edits || typeof edits !== 'object') {
    console.log('No valid edits object provided - returning original CV');
    return originalCV;
  }
  
  // Safely check for edits with proper array validation
  const sectionEdits = Array.isArray(edits.section_edits) ? edits.section_edits : [];
  const skillAdditions = Array.isArray(edits.skill_additions) ? edits.skill_additions : [];
  
  const hasEdits = sectionEdits.length > 0;
  const hasSkillEdits = skillAdditions.some(skill => 
    skill && skill.skills_to_emphasize && Array.isArray(skill.skills_to_emphasize) && skill.skills_to_emphasize.length > 0
  );
  
  if (!hasEdits && !hasSkillEdits) {
    console.log('No targeted edits needed - CV already well-aligned with job requirements');
    return originalCV;
  }
  
  console.log(`Applying ${sectionEdits.length} targeted edits...`);
  
  // Apply section edits
  sectionEdits.forEach((edit, index) => {
    if (edit && edit.original_text && edit.new_text && edit.original_text !== edit.new_text) {
      try {
        const originalEscaped = edit.original_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(originalEscaped, 'g');
        
        if (modifiedCV.includes(edit.original_text)) {
          modifiedCV = modifiedCV.replace(regex, edit.new_text + ` % source: ${edit.section}_${index}`);
          console.log(`Applied edit ${index + 1}: ${edit.section} - ${edit.justification || 'No justification provided'}`);
        }
      } catch (error) {
        console.error(`Error applying edit ${index + 1}:`, error.message);
      }
    }
  });
  
  // Apply skill emphasis (only if really needed)
  skillAdditions.forEach((skillEdit, index) => {
    if (skillEdit && skillEdit.skills_to_emphasize && Array.isArray(skillEdit.skills_to_emphasize)) {
      skillEdit.skills_to_emphasize.forEach(skill => {
        if (skill && typeof skill === 'string') {
          try {
            const skillRegex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            if (modifiedCV.match(skillRegex) && !modifiedCV.includes(`\\textbf{${skill}}`)) {
              modifiedCV = modifiedCV.replace(skillRegex, `\\textbf{${skill}}`);
              console.log(`Emphasized skill: ${skill}`);
            }
          } catch (error) {
            console.error(`Error emphasizing skill ${skill}:`, error.message);
          }
        }
      });
    }
  });
  
  return modifiedCV;
}

// Generate motivational letter
async function generateMotivationalLetter(jobData, cvData, gapAnalysis) {
  const prompt = `Generate a professional motivational letter based on the job analysis and CV data:

JOB DATA:
${JSON.stringify(jobData, null, 2)}

CV DATA:
${JSON.stringify(cvData, null, 2)}

GAP ANALYSIS:
${JSON.stringify(gapAnalysis, null, 2)}

CRITICAL REQUIREMENTS:
1. Use ONLY factual information from the CV - do not fabricate or add any details not present
2. Match the job requirements with relevant CV experiences
3. Professional, formal tone
4. 3-4 paragraphs maximum
5. Include specific examples from CV that align with job requirements
6. Show enthusiasm for the role and company
7. Highlight relevant skills and achievements from the CV

Return ONLY a JSON object with this structure:
{
  "letter": {
    "greeting": "Dear Hiring Manager,",
    "opening_paragraph": "Opening paragraph highlighting relevant background",
    "body_paragraphs": [
      "Body paragraph 1 with specific CV examples",
      "Body paragraph 2 with more relevant experiences"
    ],
    "closing_paragraph": "Closing paragraph expressing interest and next steps",
    "signature": "Sincerely,\\n[Your Name]"
  },
  "analysis": {
    "matched_requirements": ["requirement1", "requirement2"],
    "highlighted_skills": ["skill1", "skill2"],
    "relevant_experiences": ["experience1", "experience2"],
    "confidence_score": "HIGH|MEDIUM|LOW"
  }
}

CRITICAL: Return ONLY the JSON object. Do not include any explanatory text.`;

  const result = await callLLM(prompt);
  try {
    // Clean the response to extract only JSON
    const cleanedResult = result.trim();
    const jsonStart = cleanedResult.indexOf('{');
    const jsonEnd = cleanedResult.lastIndexOf('}') + 1;
    
    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error('No valid JSON found in response');
    }
    
    const jsonString = cleanedResult.substring(jsonStart, jsonEnd);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to parse motivational letter:', error);
    console.error('Raw response:', result);
    return {
      letter: {
        greeting: "Dear Hiring Manager,",
        opening_paragraph: "I am writing to express my strong interest in the position. Based on my background in computer science and relevant experience, I believe I would be a valuable addition to your team.",
        body_paragraphs: [
          "My educational background in Computer Science with a focus on Data Science, combined with my practical experience in AI and machine learning, aligns well with the requirements for this role.",
          "I have demonstrated strong technical skills through various projects and have consistently achieved top academic performance, ranking in the top 10 of my class."
        ],
        closing_paragraph: "I am excited about the opportunity to contribute to your team and would welcome the chance to discuss how my background and skills can benefit your organization.",
        signature: "Sincerely,\\nAbdelrahman Ali Elnagar"
      },
      analysis: {
        matched_requirements: ["Technical skills", "Educational background"],
        highlighted_skills: ["Programming", "Machine Learning"],
        relevant_experiences: ["AI Engineer role", "Academic achievements"],
        confidence_score: "MEDIUM"
      }
    };
  }
}

// Generate mock interview questions
async function generateMockInterviewQuestions(jobData, cvData, difficulty = 'easy') {
  const difficultyLevels = {
    easy: {
      description: "Basic concepts, fundamental knowledge, and simple problem-solving",
      count: 5,
      types: ["conceptual", "basic_coding", "mcq"]
    },
    medium: {
      description: "Intermediate concepts, practical applications, and moderate problem-solving",
      count: 5,
      types: ["practical", "coding", "system_design_basic", "mcq"]
    },
    hard: {
      description: "Advanced concepts, complex problem-solving, and in-depth technical knowledge",
      count: 5,
      types: ["advanced_coding", "system_design", "algorithm_optimization", "troubleshooting"]
    },
    extreme: {
      description: "Expert-level challenges, complex system design, and cutting-edge technology",
      count: 5,
      types: ["expert_coding", "architecture_design", "performance_optimization", "edge_cases"]
    }
  };

  const level = difficultyLevels[difficulty];
  
  const prompt = `Generate ${level.count} ${difficulty} level interview questions based on this job description and CV data.

JOB DATA:
${JSON.stringify(jobData, null, 2)}

CV DATA:
${JSON.stringify(cvData, null, 2)}

DIFFICULTY LEVEL: ${difficulty.toUpperCase()}
DESCRIPTION: ${level.description}
QUESTION TYPES: ${level.types.join(', ')}

Generate questions that test:
1. Technical skills relevant to the job
2. Problem-solving abilities
3. Practical experience
4. Industry knowledge
5. Soft skills where appropriate

Return ONLY a JSON object with this structure:
{
  "questions": [
    {
      "id": "q1",
      "type": "coding|mcq|conceptual|system_design|behavioral",
      "difficulty": "${difficulty}",
      "category": "programming|databases|frameworks|algorithms|system_design|behavioral",
      "question": "The actual question text",
      "options": ["option1", "option2", "option3", "option4"] (only for MCQ),
      "correct_answer": "correct answer or explanation",
      "expected_skills": ["skill1", "skill2"],
      "time_limit": 300 (seconds),
      "hints": ["hint1", "hint2"] (optional)
    }
  ],
  "total_questions": ${level.count},
  "estimated_duration": ${level.count * 5} (minutes)
}

CRITICAL: Return ONLY the JSON object. Make questions challenging but fair for ${difficulty} level.`;

  console.log(`MOCK | 🤖 Generating ${difficulty} questions with LLM...`);
  // Augment with personal information if available
  const personalInfo = loadPersonalInformation();
  const augmentedPrompt = personalInfo ? `${prompt}

ADDITIONAL PERSONAL INFORMATION (use to contextualize questions, do not fabricate):
${personalInfo}` : prompt;

  const result = await callLLM(augmentedPrompt);
  try {
    const cleanedResult = result.trim();
    const jsonStart = cleanedResult.indexOf('{');
    const jsonEnd = cleanedResult.lastIndexOf('}') + 1;
    
    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error('No valid JSON found in response');
    }
    
    const jsonString = cleanedResult.substring(jsonStart, jsonEnd);
    const parsed = JSON.parse(jsonString);
    console.log(`MOCK | ✅ Successfully parsed ${difficulty} questions`);
    return parsed;
  } catch (error) {
    console.error(`MOCK | ❌ Failed to parse ${difficulty} questions:`, error);
    console.error('MOCK | Raw response:', result);
    throw new Error(`Failed to generate ${difficulty} mock interview questions`);
  }
}

// Evaluate mock interview answer
async function evaluateMockInterviewAnswer(question, userAnswer, jobData, cvData) {
  const prompt = `Evaluate this mock interview answer based on the question and job requirements.

QUESTION:
${JSON.stringify(question, null, 2)}

USER ANSWER:
${userAnswer}

JOB DATA:
${JSON.stringify(jobData, null, 2)}

CV DATA:
${JSON.stringify(cvData, null, 2)}

Evaluate the answer considering:
1. Technical accuracy
2. Completeness
3. Problem-solving approach
4. Communication clarity
5. Relevance to job requirements
6. Demonstration of required skills

Return ONLY a JSON object with this structure:
{
  "score": 85 (0-100),
  "feedback": {
    "strengths": ["what the candidate did well"],
    "improvements": ["areas for improvement"],
    "technical_accuracy": "excellent|good|fair|poor",
    "completeness": "complete|mostly_complete|partial|incomplete",
    "communication": "clear|mostly_clear|unclear|very_unclear"
  },
  "detailed_analysis": {
    "correct_concepts": ["concepts answered correctly"],
    "missing_concepts": ["important concepts not addressed"],
    "suggested_improvements": ["specific suggestions for better answers"],
    "follow_up_questions": ["questions to probe deeper understanding"]
  },
  "skill_demonstration": {
    "demonstrated_skills": ["skills shown in the answer"],
    "missing_skills": ["skills that should have been demonstrated"],
    "skill_level": "beginner|intermediate|advanced|expert"
  },
  "overall_assessment": "excellent|good|satisfactory|needs_improvement|poor"
}

// (heuristic helpers moved below to avoid breaking function scopes)

CRITICAL: Return ONLY the JSON object. Be constructive and specific in feedback.`;

  // Augment with personal information if available
  const personalInfo = loadPersonalInformation();
  const augmentedPrompt = personalInfo ? `${prompt}

ADDITIONAL PERSONAL INFORMATION ABOUT THE CANDIDATE (use to personalize evaluation, must remain factual):
${personalInfo}` : prompt;

  const result = await callLLM(augmentedPrompt);
  try {
    const cleanedResult = result.trim();
    const jsonStart = cleanedResult.indexOf('{');
    const jsonEnd = cleanedResult.lastIndexOf('}') + 1;
    
    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error('No valid JSON found in response');
    }
    
    const jsonString = cleanedResult.substring(jsonStart, jsonEnd);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to evaluate mock interview answer:', error);
    console.error('Raw response:', result);
    return {
      score: 50,
      feedback: {
        strengths: ["Attempted to answer the question"],
        improvements: ["Could provide more detailed explanation"],
        technical_accuracy: "fair",
        completeness: "partial",
        communication: "mostly_clear"
      },
      detailed_analysis: {
        correct_concepts: [],
        missing_concepts: ["Detailed technical explanation"],
        suggested_improvements: ["Provide more specific examples"],
        follow_up_questions: ["Can you elaborate on this approach?"]
      },
      skill_demonstration: {
        demonstrated_skills: ["Basic understanding"],
        missing_skills: ["Advanced technical knowledge"],
        skill_level: "beginner"
      },
      overall_assessment: "needs_improvement"
    };
  }
}

// Generate change log
async function generateChangeLog(jobData, cvData, gapAnalysis, originalCV, tailoredCV) {
  const prompt = `Generate a change log for the CV optimization:

JOB DATA:
${JSON.stringify(jobData, null, 2)}

GAP ANALYSIS:
${JSON.stringify(gapAnalysis, null, 2)}

ORIGINAL CV:
${originalCV.substring(0, 1000)}...

TAILORED CV:
${tailoredCV.substring(0, 1000)}...

Return ONLY a JSON object with these fields:
{
  "changes": [
    {
      "original_text": "original text snippet",
      "new_text": "new text snippet",
      "job_reference": "phrase from job description that triggered change",
      "confidence": "HIGH|MEDIUM|LOW",
      "justification": "reason for the change"
    }
  ],
  "summary": {
    "keywords_added": ["job keywords incorporated"],
    "keywords_missing": ["job keywords that couldn't be incorporated"],
    "questions_for_user": ["clarification questions"],
    "relevance_improvement": "description of how CV was optimized for this job"
  }
}

CRITICAL: Return ONLY the JSON object. Do not include any explanatory text, comments, or additional content. Start your response with { and end with }.`;

  const result = await callLLM(prompt);
  try {
    // Clean the response to extract only JSON
    const cleanedResult = result.trim();
    const jsonStart = cleanedResult.indexOf('{');
    const jsonEnd = cleanedResult.lastIndexOf('}') + 1;
    
    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error('No valid JSON found in response');
    }
    
    const jsonString = cleanedResult.substring(jsonStart, jsonEnd);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to generate change log:', error);
    console.error('Raw response:', result);
    return {
      changes: [],
      summary: {
        keywords_added: [],
        keywords_missing: [],
        questions_for_user: [],
        relevance_improvement: "CV was optimized based on job requirements"
      }
    };
  }
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'LaTeX CV Optimizer API is running' });
});

// Configure LLM provider
app.post('/api/configure', (req, res) => {
  try {
    const { provider, apiKey } = req.body;
    
    if (!provider || !apiKey) {
      return res.status(400).json({ error: 'Provider and API key are required' });
    }

    if (!LLM_CONFIG[provider]) {
      return res.status(400).json({ error: 'Unsupported provider' });
    }

    // Update the API key in the config
    LLM_CONFIG[provider].headers.Authorization = `Bearer ${apiKey}`;
    
    res.json({ 
      success: true, 
      message: `Configured ${provider} provider`,
      provider: provider
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Main optimization endpoint
app.post('/api/optimize-cv', async (req, res) => {
  try {
    const { jobDescription, provider = 'openrouter', preferences = {} } = req.body;

    if (!jobDescription) {
      return res.status(400).json({ error: 'Job description is required' });
    }

    // Step 1: Parse job description
    console.log('CV | Step 1: Parsing job description...');
    let jobData;
    try {
      jobData = await parseJobDescription(jobDescription);
    } catch (error) {
      console.log('CV | Job parsing failed, using fallback...');
      jobData = {
        role_title: "Software Engineer",
        core_responsibilities: ["Develop software applications", "Collaborate with team"],
        required_skills: ["Programming", "Problem solving"],
        preferred_skills: [],
        keywords: jobDescription.toLowerCase().split(/\s+/).slice(0, 20),
        seniority: "mid",
        location: "Remote",
        company_type: "tech"
      };
    }

    // Step 2: Parse CV content
    console.log('CV | Step 2: Parsing CV content...');
    let cvData;
    try {
      cvData = await parseCVContent(DEFAULT_CV_TEMPLATE);
    } catch (error) {
      console.log('CV | CV parsing failed, using fallback...');
      cvData = {
        header: {
          name: "Abdelrahman Ali Elnagar",
          contact: "Ulm, Germany | abdelrahmanelnagar123@gmail.com"
        },
        sections: {
          education: [
            {
              institution: "Technische Hochschule Ulm (THU)",
              degree: "Bachelor Thesis",
              dates: "Currently Ongoing",
              achievements: ["Deep learning application for energy market"]
            }
          ],
          experience: [
            {
              role: "AI Engineer",
              company: "BSA",
              dates: "June 2025 – Present",
              bullets: ["Building Machine Learning Models", "MLOps & scalable API infrastructure"]
            }
          ],
          skills: {
            programming: ["Python", "Java", "JavaScript", "TypeScript"],
            databases: ["SQL", "MongoDB", "Redis"],
            frameworks: ["React", "Node.js", "NestJS"],
            tools: ["Git", "AWS", "Jira"]
          },
          projects: [
            {
              name: "RAG Chatbot",
              description: "Job seeking website with AI chatbot",
              technologies: ["NestJS", "Next.js", "MongoDB"]
            }
          ],
          achievements: ["1st place in 2 Kaggle ML Competitions", "DAAD Scholarship"]
        }
      };
    }

    // Step 3: Perform gap analysis
    console.log('CV | Step 3: Performing gap analysis...');
    let gapAnalysis;
    try {
      gapAnalysis = await performGapAnalysis(jobData, cvData);
    } catch (error) {
      console.log('CV | Gap analysis failed, using fallback...');
      gapAnalysis = {
        matched_keywords: ["Python", "Machine Learning", "JavaScript"],
        missing_keywords: ["Docker", "Kubernetes"],
        suggested_rewrites: [],
        clarification_questions: [],
        relevance_score: "75%"
      };
    }

    // Step 4: Generate targeted edits and apply them
    console.log('CV | Step 4: Generating targeted edits...');
    let targetedEdits;
    try {
      // Check user preferences for editing aggressiveness
      const editingMode = preferences.editing_mode || 'conservative'; // conservative, moderate, aggressive
      
      if (editingMode === 'none') {
        console.log('CV | User requested no edits - returning original CV');
        targetedEdits = {
          section_edits: [],
          skill_additions: [],
          project_reordering: []
        };
      } else {
        targetedEdits = await generateTargetedEdits(jobData, cvData, gapAnalysis, DEFAULT_CV_TEMPLATE);
      }
    } catch (error) {
      console.log('CV | Targeted edits generation failed, using fallback...');
      console.error('CV | Targeted edits error:', error.message);
      targetedEdits = {
        section_edits: [],
        skill_additions: [],
        project_reordering: []
      };
    }
    
    console.log('CV | Step 4b: Applying targeted edits...');
    let tailoredCV;
    try {
      tailoredCV = applyTargetedEdits(DEFAULT_CV_TEMPLATE, targetedEdits);
      console.log('CV | ✅ Targeted edits applied successfully');
    } catch (error) {
      console.error('CV | ❌ Error applying targeted edits:', error.message);
      console.log('CV | 🔄 Using original CV as fallback');
      tailoredCV = DEFAULT_CV_TEMPLATE;
    }

    // Step 5: Generate change log
    console.log('CV | Step 5: Generating change log...');
    let changeLog;
    try {
      changeLog = await generateChangeLog(jobData, cvData, gapAnalysis, DEFAULT_CV_TEMPLATE, tailoredCV);
    } catch (error) {
      console.log('CV | Change log generation failed, using fallback...');
      changeLog = {
        changes: targetedEdits.section_edits.map(edit => ({
          original_text: edit.original_text,
          new_text: edit.new_text,
          job_reference: edit.subsection,
          confidence: edit.confidence,
          justification: `Targeted edit to ${edit.section} section`
        })),
        summary: {
          keywords_added: gapAnalysis.matched_keywords || [],
          keywords_missing: gapAnalysis.missing_keywords || [],
          questions_for_user: [],
          relevance_improvement: "CV was optimized using targeted edits to preserve LaTeX structure"
        }
      };
    }

    // Step 6: Validation
    console.log('CV | Step 6: Validating output...');
    
    // Basic validation
    if (!tailoredCV.includes('\\documentclass') || !tailoredCV.includes('\\begin{document}')) {
      throw new Error('Generated CV is not valid LaTeX');
    }

    // Return all results
    res.json({
      success: true,
      results: {
        job_parsed: jobData,
        cv_parsed: cvData,
        gap_analysis: gapAnalysis,
        targeted_edits: targetedEdits,
        tailored_cv: tailoredCV,
        change_log: changeLog,
        summary: {
          keywords_added: changeLog.summary.keywords_added,
          keywords_missing: changeLog.summary.keywords_missing,
          questions_for_user: changeLog.summary.questions_for_user,
          relevance_improvement: changeLog.summary.relevance_improvement,
          edits_applied: targetedEdits.section_edits.length
        }
      }
    });

  } catch (error) {
    console.error('Optimization error:', error);
    res.status(500).json({ 
      error: 'CV optimization failed', 
      details: error.message 
    });
  }
});

// Start mock interview session
app.post('/api/start-mock-interview', async (req, res) => {
  try {
    console.log('MOCK | 📥 Received request to start mock interview');
    const { jobDescription, provider = 'openrouter', preferences = {}, mode = 'ai' } = req.body;

    if (!jobDescription) {
      console.log('MOCK | ❌ No job description provided');
      return res.status(400).json({ error: 'Job description is required' });
    }

    console.log('MOCK | 📋 Job description length:', jobDescription.length);
    console.log('MOCK | 🤖 Provider:', provider);
    console.log('MOCK | Starting mock interview session...');

    // Parse job description
    let jobData;
    try {
      jobData = await parseJobDescription(jobDescription);
    } catch (error) {
      console.log('MOCK | Job parsing failed, using fallback...');
      jobData = {
        role_title: "Software Engineer",
        core_responsibilities: ["Develop software applications", "Collaborate with team"],
        required_skills: ["Programming", "Problem solving"],
        preferred_skills: [],
        keywords: jobDescription.toLowerCase().split(/\s+/).slice(0, 20),
        seniority: "mid",
        location: "Remote",
        company_type: "tech"
      };
    }

    // Parse CV content
    let cvData;
    try {
      cvData = await parseCVContent(DEFAULT_CV_TEMPLATE);
    } catch (error) {
      console.log('MOCK | CV parsing failed, using fallback...');
      cvData = {
        header: {
          name: "Abdelrahman Ali Elnagar",
          contact: "Ulm, Germany | abdelrahmanelnagar123@gmail.com"
        },
        sections: {
          education: [],
          experience: [],
          skills: [],
          projects: []
        }
      };
    }

    // Generate questions (AI or Non-AI)
    console.log('MOCK | Generating mock interview questions...');
    const difficulties = ['easy', 'medium', 'hard', 'extreme'];
    const allQuestions = [];

    if (mode === 'nonai') {
      console.log('MOCK | 🚫 Using NON-AI heuristic question generation');
      const sets = generateHeuristicQuestions(jobData, cvData);
      difficulties.forEach(d => allQuestions.push(...(sets[d] || [])));
    } else {
      for (const difficulty of difficulties) {
        try {
          console.log(`MOCK | 🎯 Generating ${difficulty} questions...`);
          const questions = await generateMockInterviewQuestions(jobData, cvData, difficulty);
          if (questions && questions.questions && Array.isArray(questions.questions)) {
            allQuestions.push(...questions.questions);
            console.log(`MOCK | ✅ Generated ${questions.questions.length} ${difficulty} questions`);
          } else {
            throw new Error('Invalid questions structure received');
          }
        } catch (error) {
          console.log(`MOCK | ❌ Failed to generate ${difficulty} questions, using heuristic fallback...`);
          console.error(`MOCK | ${difficulty} questions error:`, error.message);
          const sets = generateHeuristicQuestions(jobData, cvData);
          allQuestions.push(...(sets[difficulty] || []));
        }
      }
    }

    // Create mock interview session
    const mockInterviewSession = {
      id: Date.now().toString(),
      jobData: jobData,
      cvData: cvData,
      questions: allQuestions,
      currentQuestionIndex: 0,
      answers: [],
      scores: [],
      startTime: new Date().toISOString(),
      status: 'active',
      totalQuestions: allQuestions.length,
      completedQuestions: 0,
      mode
    };

    // Store the session
    currentMockInterview = mockInterviewSession;

    console.log('MOCK | ✅ Mock interview session created successfully');
    console.log('MOCK | 📝 Session ID:', mockInterviewSession.id);
    console.log('MOCK | ❓ Total Questions:', mockInterviewSession.totalQuestions);
    console.log('MOCK | 💼 Job Title:', jobData.role_title);

    res.json({
      success: true,
      session: {
        id: mockInterviewSession.id,
        totalQuestions: mockInterviewSession.totalQuestions,
        estimatedDuration: Math.ceil(mockInterviewSession.totalQuestions * 5), // 5 minutes per question
        jobTitle: jobData.role_title,
        difficultyLevels: ['easy', 'medium', 'hard', 'extreme'],
        currentQuestion: mockInterviewSession.questions[0],
        mode
      }
    });

  } catch (error) {
    console.error('MOCK | 💥 Mock interview start error:', error);
    res.status(500).json({ 
      error: 'Failed to start mock interview', 
      details: error.message 
    });
  }
});

// Get next question in mock interview
app.get('/api/mock-interview/next-question', (req, res) => {
  try {
    if (!currentMockInterview) {
      return res.status(404).json({ error: 'No active mock interview session' });
    }

    const { currentQuestionIndex } = currentMockInterview;
    
    if (currentQuestionIndex >= currentMockInterview.questions.length) {
      return res.json({
        success: true,
        completed: true,
        message: 'All questions completed'
      });
    }

    const question = currentMockInterview.questions[currentQuestionIndex];
    
    res.json({
      success: true,
      question: {
        id: question.id,
        type: question.type,
        difficulty: question.difficulty,
        category: question.category,
        question: question.question,
        options: question.options || null,
        timeLimit: question.time_limit,
        hints: question.hints || [],
        questionNumber: currentQuestionIndex + 1,
        totalQuestions: currentMockInterview.totalQuestions
      }
    });

  } catch (error) {
    console.error('Get next question error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit answer for current question
app.post('/api/mock-interview/submit-answer', async (req, res) => {
  try {
    const { answer, questionId } = req.body;

    if (!currentMockInterview) {
      return res.status(404).json({ error: 'No active mock interview session' });
    }

    if (!answer) {
      return res.status(400).json({ error: 'Answer is required' });
    }

    const currentQuestion = currentMockInterview.questions[currentMockInterview.currentQuestionIndex];
    
    if (currentQuestion.id !== questionId) {
      return res.status(400).json({ error: 'Question ID mismatch' });
    }

    console.log(`MOCK | Evaluating answer for question ${questionId}...`);

    // Evaluate the answer (AI or Non-AI)
    let evaluation;
    if (currentMockInterview.mode === 'nonai') {
      console.log('MOCK | 🚫 Using NON-AI heuristic evaluation');
      evaluation = evaluateHeuristicAnswer(currentQuestion, answer, currentMockInterview.cvData);
    } else {
      try {
        console.log('MOCK | 🤖 Evaluating answer with LLM...');
        evaluation = await evaluateMockInterviewAnswer(currentQuestion, answer, currentMockInterview.jobData, currentMockInterview.cvData);
        console.log('MOCK | ✅ Answer evaluation completed successfully');
      } catch (error) {
        console.log('MOCK | ❌ Answer evaluation failed, using heuristic fallback...');
        console.error('MOCK | Evaluation error:', error.message);
        evaluation = evaluateHeuristicAnswer(currentQuestion, answer, currentMockInterview.cvData);
      }
    }

    // Store the answer and evaluation
    const answerData = {
      questionId: questionId,
      question: currentQuestion.question,
      difficulty: currentQuestion.difficulty,
      userAnswer: answer,
      evaluation: evaluation,
      timestamp: new Date().toISOString()
    };

    currentMockInterview.answers.push(answerData);
    currentMockInterview.scores.push(evaluation.score);
    currentMockInterview.currentQuestionIndex++;
    currentMockInterview.completedQuestions++;

    // Check if interview is complete
    const isComplete = currentMockInterview.currentQuestionIndex >= currentMockInterview.questions.length;
    
    if (isComplete) {
      currentMockInterview.status = 'completed';
      currentMockInterview.endTime = new Date().toISOString();
    }

    res.json({
      success: true,
      evaluation: evaluation,
      isComplete: isComplete,
      progress: {
        completed: currentMockInterview.completedQuestions,
        total: currentMockInterview.totalQuestions,
        currentScore: currentMockInterview.scores.length > 0 ? 
          Math.round(currentMockInterview.scores.reduce((a, b) => a + b, 0) / currentMockInterview.scores.length) : 0
      }
    });

  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get mock interview results
app.get('/api/mock-interview/results', (req, res) => {
  try {
    if (!currentMockInterview) {
      return res.status(404).json({ error: 'No mock interview session found' });
    }

    if (currentMockInterview.status !== 'completed') {
      return res.status(400).json({ error: 'Mock interview not completed yet' });
    }

    // Calculate overall statistics
    const totalScore = currentMockInterview.scores.reduce((a, b) => a + b, 0);
    const averageScore = Math.round(totalScore / currentMockInterview.scores.length);
    
    const difficultyStats = {};
    ['easy', 'medium', 'hard', 'extreme'].forEach(difficulty => {
      const difficultyAnswers = currentMockInterview.answers.filter(a => a.difficulty === difficulty);
      if (difficultyAnswers.length > 0) {
        const difficultyScores = difficultyAnswers.map(a => a.evaluation.score);
        difficultyStats[difficulty] = {
          count: difficultyAnswers.length,
          averageScore: Math.round(difficultyScores.reduce((a, b) => a + b, 0) / difficultyScores.length),
          scores: difficultyScores
        };
      }
    });

    const results = {
      sessionId: currentMockInterview.id,
      jobTitle: currentMockInterview.jobData.role_title,
      startTime: currentMockInterview.startTime,
      endTime: currentMockInterview.endTime,
      totalQuestions: currentMockInterview.totalQuestions,
      completedQuestions: currentMockInterview.completedQuestions,
      overallScore: averageScore,
      difficultyStats: difficultyStats,
      answers: currentMockInterview.answers,
      recommendations: generateInterviewRecommendations(currentMockInterview.answers, averageScore)
    };

    res.json({
      success: true,
      results: results
    });

  } catch (error) {
    console.error('Get results error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Variant Questions endpoint (standalone generator)
app.post('/api/variant-questions', async (req, res) => {
  try {
    const { topic = '', count = 5, difficulty = 'mixed', mode = 'nonai' } = req.body || {};
    const safeCount = Math.max(1, Math.min(20, parseInt(count, 10) || 5));
    const diffs = difficulty === 'mixed' ? ['easy','medium','hard','extreme'] : [difficulty];

    const buildHeuristic = () => {
      const types = ['conceptual','mcq','system_design','practical'];
      const qs = [];
      for (let i = 0; i < safeCount; i++) {
        const d = diffs[i % diffs.length];
        const t = types[i % types.length];
        const base = {
          id: `var_${d}_${i+1}`,
          type: t,
          difficulty: d,
          category: 'variant',
          question: t === 'mcq' ? `Which statement about ${topic} is correct?` : `Describe/Explain ${topic} in the context of real projects.`,
          expected_skills: [String(topic || 'problem solving')],
          time_limit: 180,
          hints: ['Use concrete examples', 'Relate to outcomes']
        };
        if (t === 'mcq') {
          base.options = [
            `${topic} improves performance`,
            `${topic} reduces security`,
            `${topic} is unrelated to software`,
            `None of the above`
          ];
        }
        qs.push(base);
      }
      return qs;
    };

    if (mode === 'nonai') {
      return res.json({ success: true, questions: buildHeuristic() });
    }

    // AI mode
    const personalInfo = loadPersonalInformation();
    const prompt = `Generate ${safeCount} ${difficulty.toUpperCase()} variant interview questions about the TOPIC below.

TOPIC: ${topic}

QUESTION FORMAT (JSON only):
{
  "questions": [
    {
      "id": "v1",
      "type": "coding|mcq|conceptual|system_design|behavioral|practical",
      "difficulty": "easy|medium|hard|extreme",
      "category": "variant",
      "question": "text",
      "options": ["opt1","opt2","opt3","opt4"],
      "expected_skills": ["skill1","skill2"],
      "time_limit": 180,
      "hints": ["hint1","hint2"]
    }
  ]
}

CONSTRAINTS:
- Difficulty should be ${difficulty} (or a reasonable mix if 'mixed').
- Prefer concise, fair questions; include MCQs occasionally.
- Use the candidate profile to personalize where relevant; do not fabricate facts.

PERSONAL INFORMATION (optional):
${personalInfo}`;

    let parsed;
    try {
      const aiResp = await callLLM(prompt);
      const cleaned = String(aiResp).trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}') + 1;
      if (start === -1 || end === 0) throw new Error('Invalid AI response');
      parsed = JSON.parse(cleaned.substring(start, end));
    } catch (e) {
      // Fallback to heuristic
      return res.json({ success: true, questions: buildHeuristic() });
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, safeCount) : buildHeuristic();
    res.json({ success: true, questions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Variant Answer endpoint (crafts human, empathetic answer)
app.post('/api/variant-answer', async (req, res) => {
  try {
    const { question = '', tone = 'sincere', concise = true, provider = 'openrouter' } = req.body || {};
    const q = String(question).trim();
    if (!q) {
      return res.status(400).json({ success: false, error: 'Question is required' });
    }

    // Build context from CV and personal information
    let cvData;
    try {
      cvData = await parseCVContent(DEFAULT_CV_TEMPLATE);
    } catch (_) {
      cvData = {};
    }
    const personalInfo = loadPersonalInformation();

    const styleGuidelines = `
STYLE GUIDELINES:
- Sound human: vary sentence lengths, avoid overuse of commas and semicolons.
- Be empathetic and authentic. Use first person but avoid cliches.
- Tie motivations to concrete experiences (use CV data) and values (from personal info).
- Avoid AI telltales: no "As an AI", no robotic phrasing, no numbered lists unless natural.
- Keep ${concise ? 'concise (5-8 sentences max)' : 'detailed (8-12 sentences)'}.
- Tone: ${tone.toUpperCase()}.
`;

    const prompt = `Craft a personal interview answer to the QUESTION below using the candidate's CV and personal information. Stay factual to CV/personal info. Do not fabricate or invent companies, titles, or dates.

QUESTION:
${q}

CANDIDATE CV (structured):
${JSON.stringify(cvData, null, 2)}

PERSONAL INFORMATION (free text):
${personalInfo}

${styleGuidelines}

Return ONLY the answer text (no JSON, no preface).`;

    let answer;
    try {
      answer = await callLLM(prompt, provider);
      if (typeof answer !== 'string' || !answer.trim()) throw new Error('Empty answer');
      // Strip potential extra formatting
      answer = answer.replace(/^"|"$/g, '').trim();
    } catch (e) {
      // Fallback heuristic answer
      const name = cvData?.header?.name || 'I';
      answer = `${name} value${name==='I'?'':'s'} thoughtful work and growth. Your company aligns with my experience in ${
        (cvData?.sections?.experience?.[0]?.role || 'engineering')
      } and my interest in ${
        (cvData?.sections?.projects?.[0]?.name || 'building useful tools')
      }. I’m drawn to teams who care about people and impact. From my background, I’ve learned to balance discipline with empathy—staying curious while delivering results. I’d like to bring that mindset here, contribute quickly, and keep learning with your team.`;
    }

    res.json({ success: true, answer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to generate interview recommendations
function generateInterviewRecommendations(answers, overallScore) {
  const recommendations = [];
  
  if (overallScore < 60) {
    recommendations.push("Focus on fundamental concepts and practice basic problem-solving");
  } else if (overallScore < 80) {
    recommendations.push("Continue practicing intermediate-level problems and system design");
  } else {
    recommendations.push("Excellent performance! Consider advanced topics and leadership scenarios");
  }

  // Analyze by difficulty
  const difficultyScores = {};
  answers.forEach(answer => {
    if (!difficultyScores[answer.difficulty]) {
      difficultyScores[answer.difficulty] = [];
    }
    difficultyScores[answer.difficulty].push(answer.evaluation.score);
  });

  Object.keys(difficultyScores).forEach(difficulty => {
    const avgScore = difficultyScores[difficulty].reduce((a, b) => a + b, 0) / difficultyScores[difficulty].length;
    if (avgScore < 60) {
      recommendations.push(`Focus more on ${difficulty} level questions and concepts`);
    }
  });

  return recommendations;
}

// Download tailored CV
app.post('/api/download-cv', (req, res) => {
  try {
    const { cvContent, filename = 'tailored_cv.tex' } = req.body;

    if (!cvContent) {
      return res.status(400).json({ error: 'CV content is required' });
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'application/x-tex');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Send the file content
    res.send(cvContent);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate motivational letter endpoint
app.post('/api/generate-motivational-letter', async (req, res) => {
  try {
    const { jobDescription, provider = 'openrouter', preferences = {} } = req.body;

    if (!jobDescription) {
      return res.status(400).json({ error: 'Job description is required' });
    }

    console.log('LETTER | Step 1: Parsing job description for motivational letter...');
    let jobData;
    try {
      jobData = await parseJobDescription(jobDescription);
    } catch (error) {
      console.log('LETTER | Job parsing failed, using fallback...');
      jobData = {
        title: "Software Engineer",
        company: "Company",
        requirements: ["Technical skills", "Problem solving"],
        responsibilities: ["Develop software", "Collaborate with team"],
        keywords: ["programming", "development"],
        skills_required: ["Python", "JavaScript"],
        experience_level: "Entry to Mid-level"
      };
    }

    console.log('LETTER | Step 2: Parsing CV content for motivational letter...');
    let cvData;
    try {
      cvData = await parseCVContent(DEFAULT_CV_TEMPLATE);
    } catch (error) {
      console.log('LETTER | CV parsing failed, using fallback...');
      cvData = {
        header: {
          name: "Abdelrahman Ali Elnagar",
          contact: {
            email: "abdelrahmanelnagar123@gmail.com",
            phone: "+49 15237095469"
          }
        },
        sections: {
          education: [],
          experience: [],
          skills: [],
          projects: []
        }
      };
    }

    console.log('LETTER | Step 3: Performing gap analysis for motivational letter...');
    let gapAnalysis;
    try {
      gapAnalysis = await performGapAnalysis(jobData, cvData);
    } catch (error) {
      console.log('LETTER | Gap analysis failed, using fallback...');
      gapAnalysis = {
        matched_keywords: [],
        missing_keywords: [],
        relevance_score: "75%",
        recommendations: []
      };
    }

    console.log('LETTER | Step 4: Generating motivational letter...');
    let motivationalLetter;
    try {
      motivationalLetter = await generateMotivationalLetter(jobData, cvData, gapAnalysis);
    } catch (error) {
      console.log('LETTER | Motivational letter generation failed, using fallback...');
      motivationalLetter = {
        letter: {
          greeting: "Dear Hiring Manager,",
          opening_paragraph: "I am writing to express my strong interest in the position. Based on my background in computer science and relevant experience, I believe I would be a valuable addition to your team.",
          body_paragraphs: [
            "My educational background in Computer Science with a focus on Data Science, combined with my practical experience in AI and machine learning, aligns well with the requirements for this role.",
            "I have demonstrated strong technical skills through various projects and have consistently achieved top academic performance, ranking in the top 10 of my class."
          ],
          closing_paragraph: "I am excited about the opportunity to contribute to your team and would welcome the chance to discuss how my background and skills can benefit your organization.",
          signature: "Sincerely,\\nAbdelrahman Ali Elnagar"
        },
        analysis: {
          matched_requirements: ["Technical skills", "Educational background"],
          highlighted_skills: ["Programming", "Machine Learning"],
          relevant_experiences: ["AI Engineer role", "Academic achievements"],
          confidence_score: "MEDIUM"
        }
      };
    }

    // Store the motivational letter for download
    currentMotivationalLetter = motivationalLetter;

    console.log('LETTER | Step 5: Validating motivational letter output...');

    // Return all results
    res.json({
      success: true,
      results: {
        job_parsed: jobData,
        cv_parsed: cvData,
        gap_analysis: gapAnalysis,
        motivational_letter: motivationalLetter,
        summary: {
          matched_requirements: motivationalLetter.analysis.matched_requirements,
          highlighted_skills: motivationalLetter.analysis.highlighted_skills,
          relevant_experiences: motivationalLetter.analysis.relevant_experiences,
          confidence_score: motivationalLetter.analysis.confidence_score
        }
      }
    });

  } catch (error) {
    console.error('Motivational letter generation error:', error);
    res.status(500).json({ 
      error: 'Motivational letter generation failed', 
      details: error.message 
    });
  }
});

// Download motivational letter endpoint
app.get('/api/download-motivational-letter', (req, res) => {
  if (!currentMotivationalLetter) {
    return res.status(404).json({ error: 'No motivational letter available for download' });
  }

  // Format the letter as plain text
  const letter = currentMotivationalLetter.letter;
  const formattedLetter = [
    letter.greeting,
    '',
    letter.opening_paragraph,
    '',
    ...letter.body_paragraphs,
    '',
    letter.closing_paragraph,
    '',
    letter.signature
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="motivational_letter.txt"');
  res.send(formattedLetter);
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`LaTeX CV Optimizer server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to use the application`);
});

module.exports = app;
