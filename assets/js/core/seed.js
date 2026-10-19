// Sample content for a fresh install. Admin → Settings → Data lets you clear it before launch.
(function () {
    const TOS = window.TOS = window.TOS || {};
    const IMG = id => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=70`;
    const DAY = 86400000;
    const ago = d => new Date(Date.now() - d * DAY).toISOString();

    TOS.seed = function (db) {
        const L = TOS.lms;

        // ---------- Categories (top level + subcategories) ----------
        const cat = (name, icon, parentId, order) => db.insert('categories', { name, slug: L.slugify(name), icon, parentId: parentId || null, description: '', order });
        const dev = cat('Development', 'fa-code', null, 1), design = cat('Design', 'fa-pen-ruler', null, 2), ai = cat('AI & Data', 'fa-brain', null, 3), sec = cat('Security & Cloud', 'fa-shield-halved', null, 4), biz = cat('Business & Marketing', 'fa-chart-line', null, 5);
        const sub = {
            web: cat('Web Development', 'fa-globe', dev.id, 1), prog: cat('Programming', 'fa-terminal', dev.id, 2), mobile: cat('Mobile Apps', 'fa-mobile-screen', dev.id, 3), chain: cat('Blockchain', 'fa-link', dev.id, 4),
            ux: cat('UI/UX Design', 'fa-object-group', design.id, 1), ml: cat('Machine Learning', 'fa-diagram-project', ai.id, 1), gen: cat('Generative AI', 'fa-wand-magic-sparkles', ai.id, 2), data: cat('Data Analysis', 'fa-chart-pie', ai.id, 3),
            cyber: cat('Cybersecurity', 'fa-user-shield', sec.id, 1), cloud: cat('Cloud Computing', 'fa-cloud', sec.id, 2), mkt: cat('Digital Marketing', 'fa-bullhorn', biz.id, 1)
        };

        // ---------- Instructors (+ one staff login) ----------
        const staffUser = db.insert('users', { role: 'staff', name: 'Clifford Mensah', email: 'instructor@techoasisltd.com', password: 'staff123' });
        const ins = (name, title, bio, avatar, userId) => db.insert('instructors', { name, title, bio, avatar: avatar ? IMG(avatar) : '', email: '', userId: userId || null });
        const I = {
            clifford: ins('Clifford Mensah', 'Senior Full-Stack Engineer', 'Clifford has shipped web and mobile products for fintech and e-commerce teams across West Africa for over a decade.', 'photo-1506794778202-cad84cf45f1d', staffUser.id),
            yepa: ins('Yepa Udeami', 'Lead Product Designer', 'Yepa designs digital products used by millions and mentors designers moving into product roles.', 'photo-1531123897727-8f129e1688ce'),
            kofi: ins('Dr. Kofi Mensah', 'AI Research Lead', 'Kofi holds a PhD in machine learning and builds applied AI systems for healthcare and agriculture.', 'photo-1507003211169-0a1dd7228f2d'),
            ama: ins('Ama Owusu', 'Cloud & Security Architect', 'Ama secures and scales cloud platforms and holds multiple professional cloud and security certifications.', 'photo-1494790108377-be9c29b29330'),
            tunde: ins('Tunde Bakare', 'Growth Marketing Director', 'Tunde has led growth for startups from seed stage to millions of users.', 'photo-1500648767791-00dcc994a43e'),
            faculty: ins('Tech Oasis Faculty', 'Teaching Team', 'Our core teaching team of working engineers, designers and data practitioners.', '')
        };

        // ---------- Courses ----------
        const mk = (o) => {
            const c = L.createCourse(Object.assign({ status: 'published', visibility: 'public', price: 5, isFree: false, certificateEnabled: true, language: 'English', publishedAt: ago(o.age || 60) }, o.data));
            db.update('courses', c.id, { createdAt: ago(o.age || 60) });
            return c;
        };
        const sectionWith = (courseId, title, description, lessons) => {
            const s = L.addSection(courseId, { title, description, status: 'published' });
            return { s, lessons: lessons.map(l => {
                const les = L.addLesson(s.id, Object.assign({ status: 'published' }, l, { video: undefined, article: undefined, questions: undefined, assignment: undefined }));
                if (l.video) { const c = db.first('contents', { lessonId: les.id, kind: 'video' }); const p = TOS.video.detect(l.video); db.update('contents', c.id, { url: l.video, provider: p.id, ref: p.parse(l.video), durationSec: (l.durationMin || 8) * 60, videoStatus: 'ready', transcript: l.transcript || '' }); }
                if (l.article) { const c = db.first('contents', { lessonId: les.id, kind: 'article' }); db.update('contents', c.id, { body: l.article }); }
                if (l.questions) { const q = L.quizOf(les.id); l.questions.forEach((qq, i) => db.insert('quiz_questions', Object.assign({ quizId: q.id, order: i + 1, points: 1 }, qq))); }
                if (l.assignment) { const a = L.assignmentOf(les.id); db.update('assignments', a.id, l.assignment); }
                return les;
            }) };
        };
        const opt = (...texts) => texts.map((t, i) => ({ id: 'o' + (i + 1), text: t }));

        // === Flagship: Web Development (full curriculum) ===
        const web = mk({ age: 120, data: {
            title: 'Web Development', instructorId: I.clifford.id, categoryId: dev.id, subcategoryId: sub.web.id, level: 'Beginner', estimatedHours: 32, featured: true,
            thumbnail: IMG('photo-1461749280684-dccba630e2f6'),
            shortDescription: 'Go from zero to building and deploying complete, responsive websites with HTML, CSS and JavaScript.',
            description: 'This program takes you from your very first line of HTML to a complete, deployed website you can show employers.\n\nYou will learn how the web works, structure pages with semantic HTML, style them with modern CSS (Flexbox, Grid and responsive design), and bring them to life with JavaScript. Every section ends with practice, and the program finishes with a portfolio-ready final project reviewed by an instructor.',
            requirements: ['A computer with internet access', 'No prior coding experience needed', 'A free code editor such as VS Code'],
            outcomes: ['Explain how browsers, servers and the web work together', 'Build accessible, semantic HTML pages', 'Style responsive layouts with Flexbox and CSS Grid', 'Add interactivity with modern JavaScript', 'Deploy a complete website to the internet', 'Present a portfolio project to employers'],
            audience: ['Complete beginners starting a tech career', 'Designers who want to build what they design', 'Entrepreneurs who want to launch their own site']
        } });
        const yt = 'https://www.youtube.com/watch?v=';
        sectionWith(web.id, 'Introduction to Web Development', 'How the web works and how to set up your tools.', [
            { title: 'Welcome to the program', type: 'video', video: yt + 'zJSY8tbf_ys', durationMin: 6, isPreview: true, summary: 'Meet your instructor and see what you will build.', body: 'In this lesson you will meet your instructor, see the final project you will build, and learn how to get the most from the program.', transcript: 'Welcome to Web Development at Tech Oasis School. Over the next few weeks you will go from your very first HTML tag to a complete, deployed website...' },
            { title: 'How the web works', type: 'article', durationMin: 10, isPreview: true, summary: 'Browsers, servers, HTTP and DNS in plain language.', article: '## What happens when you open a website?\n\nWhen you type an address into your browser, a few things happen very quickly:\n\n1. Your browser asks **DNS** to turn the domain name into an IP address.\n2. It sends an **HTTP request** to the server at that address.\n3. The server replies with **HTML**, which the browser reads and draws on screen.\n4. The HTML points to **CSS** and **JavaScript** files, which are downloaded too.\n\n> Think of HTML as the structure of a house, CSS as the paint and furniture, and JavaScript as the electricity.\n\n## Key terms\n\n- **Client**: the browser on your device\n- **Server**: the computer that stores and sends the website\n- **HTTP**: the language they use to talk' },
            { title: 'Setting up your tools', type: 'video', video: yt + 'ScMzIvxBSi4', durationMin: 9, summary: 'Install VS Code and your browser developer tools.', body: 'Install VS Code, add the Live Server extension, and learn to open your browser developer tools.' }
        ]);
        sectionWith(web.id, 'HTML Fundamentals', 'Structure content with semantic, accessible HTML.', [
            { title: 'What is HTML?', type: 'video', video: yt + 'qz0aGYrrlhU', durationMin: 8, summary: 'Elements, tags and attributes.', body: 'HTML (HyperText Markup Language) describes the structure of a web page using elements.' },
            { title: 'HTML Document Structure', type: 'article', durationMin: 10, summary: 'doctype, head, body and metadata.', article: '## The skeleton of every page\n\n```html\n<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8">\n    <title>My first page</title>\n  </head>\n  <body>\n    <h1>Hello, world!</h1>\n  </body>\n</html>\n```\n\n- The `head` holds information *about* the page.\n- The `body` holds everything the visitor sees.' },
            { title: 'Headings and Paragraphs', type: 'video', video: yt + 'UB1O30fR-EE', durationMin: 7, summary: 'Organise text with headings h1–h6 and paragraphs.' },
            { title: 'Links and Images', type: 'video', video: yt + 'pQN-pnXPaVg', durationMin: 9, summary: 'Connect pages and add images with alt text.' },
            { title: 'HTML Forms', type: 'video', video: yt + 'fNcJuPIZ2WE', durationMin: 12, summary: 'Collect input with forms, labels and validation.' },
            { title: 'HTML Tables', type: 'article', durationMin: 8, summary: 'Present tabular data the accessible way.', article: '## When to use a table\n\nUse tables for **data**, never for page layout.\n\n```html\n<table>\n  <thead><tr><th>Course</th><th>Hours</th></tr></thead>\n  <tbody><tr><td>HTML</td><td>6</td></tr></tbody>\n</table>\n```' },
            { title: 'Practice Exercise: HTML Check', type: 'quiz', durationMin: 10, summary: 'Check your understanding of HTML fundamentals.', questions: [
                { type: 'single', prompt: 'Which element holds the content visitors see on the page?', options: opt('<head>', '<body>', '<meta>', '<title>'), correct: ['o2'], explanation: 'Everything visible goes inside <body>. The <head> holds metadata.' },
                { type: 'truefalse', prompt: 'The alt attribute on an image helps screen-reader users understand it.', options: opt('True', 'False'), correct: ['o1'], explanation: 'Alt text describes the image for people who cannot see it, and shows if the image fails to load.' },
                { type: 'multiple', prompt: 'Which of these are semantic HTML elements? (Select all that apply)', options: opt('<nav>', '<div>', '<article>', '<footer>'), correct: ['o1', 'o3', 'o4'], explanation: '<nav>, <article> and <footer> describe their meaning. <div> is a generic container.', points: 2 },
                { type: 'single', prompt: 'Which tag creates a hyperlink?', options: opt('<link>', '<href>', '<a>', '<url>'), correct: ['o3'], explanation: 'The anchor element <a href="..."> creates links.' }
            ] }
        ]);
        sectionWith(web.id, 'CSS Fundamentals', 'Style beautiful, responsive layouts.', [
            { title: 'Introduction to CSS', type: 'video', video: yt + 'OEV8gMkCHXQ', durationMin: 10, summary: 'Selectors, properties and the cascade.' },
            { title: 'The Box Model', type: 'video', video: yt + 'rIO5326FgPE', durationMin: 8, summary: 'Margin, border, padding and content.' },
            { title: 'Flexbox and Grid', type: 'video', video: yt + 'phWxA89Dy94', durationMin: 14, summary: 'Modern layout systems.' },
            { title: 'Responsive Design', type: 'article', durationMin: 10, summary: 'Media queries and mobile-first CSS.', article: '## Mobile first\n\nStart with styles for small screens, then add **media queries** for larger screens:\n\n```css\n.grid { display: grid; gap: 1rem; }\n@media (min-width: 768px) {\n  .grid { grid-template-columns: repeat(3, 1fr); }\n}\n```' }
        ]);
        sectionWith(web.id, 'JavaScript Fundamentals', 'Make your pages interactive.', [
            { title: 'Variables and Data Types', type: 'video', video: yt + 'W6NZfCO5SIk', durationMin: 12, summary: 'let, const, strings, numbers and booleans.' },
            { title: 'Functions and Events', type: 'video', video: yt + 'N8ap4k_1QEQ', durationMin: 11, summary: 'Respond to clicks and user input.' },
            { title: 'Working with the DOM', type: 'video', video: yt + 'y17RuWkWdn8', durationMin: 13, summary: 'Select and change page elements.' },
            { title: 'JavaScript Quiz', type: 'quiz', durationMin: 8, summary: 'Test your JavaScript basics.', questions: [
                { type: 'single', prompt: 'Which keyword declares a variable that cannot be reassigned?', options: opt('var', 'let', 'const', 'static'), correct: ['o3'], explanation: 'const creates a binding that cannot be reassigned.' },
                { type: 'truefalse', prompt: 'addEventListener lets you run code when a user clicks a button.', options: opt('True', 'False'), correct: ['o1'], explanation: 'element.addEventListener("click", handler) runs handler on each click.' },
                { type: 'single', prompt: 'What does document.querySelector(".card") return?', options: opt('All elements with class card', 'The first element with class card', 'A CSS rule', 'Nothing'), correct: ['o2'], explanation: 'querySelector returns the first match; querySelectorAll returns all of them.' }
            ] }
        ]);
        sectionWith(web.id, 'Building a Complete Website', 'Put it all together in a real multi-page site.', [
            { title: 'Planning your site', type: 'article', durationMin: 10, summary: 'Sitemaps, wireframes and content.', article: '## Plan before you code\n\n- List the pages you need\n- Sketch a simple wireframe for each\n- Gather your content and images\n- Choose two fonts and a small colour palette' },
            { title: 'Building the layout', type: 'video', video: yt + 'G3e-cpL7ofc', durationMin: 18, summary: 'Code the header, main content and footer.' },
            { title: 'Deploying your website', type: 'video', video: yt + 'RWbOihx6-bQ', durationMin: 10, summary: 'Publish your site for free.' }
        ]);
        sectionWith(web.id, 'Final Project', 'Build and submit your portfolio website.', [
            { title: 'Final Project: Portfolio Website', type: 'assignment', durationMin: 240, summary: 'Design, build and deploy your personal portfolio.', body: 'Bring everything together in a site that represents you.', assignment: {
                title: 'Portfolio Website', maxScore: 100, dueDays: 21, allowFile: true, allowText: true,
                instructions: 'Build a responsive, multi-page portfolio website with at least a Home, About and Projects page.\n\nSubmit the live link and your repository link in the text box, and optionally upload a ZIP of your code.',
                rubric: [{ criterion: 'Semantic, accessible HTML', points: 25, description: 'Correct elements, alt text, labelled forms.' }, { criterion: 'Responsive CSS layout', points: 30, description: 'Works well on phone, tablet and desktop.' }, { criterion: 'JavaScript interactivity', points: 25, description: 'At least one meaningful interactive feature.' }, { criterion: 'Deployment & polish', points: 20, description: 'Live, fast and free of broken links.' }]
            } }
        ]);
        db.insert('resources', { courseId: web.id, lessonId: null, name: 'HTML & CSS cheat sheet.pdf', fileType: 'pdf', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML', sizeBytes: 482000, access: 'enrolled' });
        db.insert('resources', { courseId: web.id, lessonId: null, name: 'Starter project files.zip', fileType: 'zip', url: 'https://github.com/mdn/beginner-html-site', sizeBytes: 1250000, access: 'enrolled' });
        const htmlLesson = db.first('lessons', l => l.title === 'HTML Document Structure');
        db.insert('resources', { courseId: null, lessonId: htmlLesson.id, name: 'Page template.html', fileType: 'code', url: 'https://developer.mozilla.org/en-US/docs/Learn/Getting_started_with_the_web/HTML_basics', sizeBytes: 2100, access: 'enrolled' });

        // === The rest of the catalog ===
        const catalog = [
            ['Web Design', design.id, sub.ux.id, 'Beginner', I.yepa, 'photo-1559028012-481c04fa702d', 'ScMzIvxBSi4', 'Master modern UI layout, wireframing and responsive web aesthetics.', ['Introduction to UI', 'Figma & Prototyping', 'Responsive Grids', 'Design Systems'], 18, 100],
            ['Coding', dev.id, sub.prog.id, 'Beginner', I.faculty, 'photo-1515879218367-8466d910aaa4', 'rfscVS0vtbw', 'Learn core programming logic, algorithms and syntax across popular languages.', ['Variables & Logic', 'Data Structures', 'Algorithms', 'Debugging'], 24, 95],
            ['Artificial Intelligence (AI)', ai.id, sub.gen.id, 'Intermediate', I.kofi, 'photo-1677442136019-21780ecad995', 'JMUxmLyrhSk', 'Understand neural networks, prompt engineering and generative AI models.', ['AI Fundamentals', 'Prompt Engineering', 'Generative Models', 'API Integration'], 28, 20],
            ['Machine Learning', ai.id, sub.ml.id, 'Advanced', I.kofi, 'photo-1555949963-aa79dcee981c', 'i_LwzRVP7bg', 'Train predictive models and evaluate algorithms using Python and data libraries.', ['Python for ML', 'Scikit-Learn', 'Supervised Learning', 'Model Evaluation'], 40, 40],
            ['Cybersecurity', sec.id, sub.cyber.id, 'Intermediate', I.ama, 'photo-1550751827-4bd374c3f58b', '3Kq1MIfTWCE', 'Protect networks, detect threats and learn ethical hacking practices.', ['Network Security', 'Threat Analysis', 'Ethical Hacking', 'Defense Protocols'], 30, 75],
            ['Data Science', ai.id, sub.data.id, 'Beginner', I.kofi, 'photo-1551288049-bebda4e38f71', 'ua-CiDNNj30', 'Analyse complex datasets, visualise metrics and draw data-backed insights.', ['Data Cleaning', 'Pandas & NumPy', 'Data Visualization', 'SQL Queries'], 34, 70],
            ['App Development', dev.id, sub.mobile.id, 'Intermediate', I.clifford, 'photo-1512941937669-90a1b58e7e9c', 'fis26HvvDII', 'Design and build native and cross-platform mobile apps for iOS and Android.', ['Mobile UI & UX', 'React Native', 'State Management', 'App Store Deployment'], 36, 50],
            ['UI/UX Design', design.id, sub.ux.id, 'Beginner', I.yepa, 'photo-1586717791821-3f44a563fa4c', 'c9Wg6Cb_YlU', 'Craft user-centred interfaces, user flows and interactive prototypes in Figma.', ['User Research', 'Wireframing', 'Interactive Prototypes', 'Usability Testing'], 22, 12],
            ['Digital Marketing', biz.id, sub.mkt.id, 'Beginner', I.tunde, 'photo-1533750349088-cd871a92f312', 'nU-IIXBWlS4', 'Drive online growth with SEO, social media advertising and content funnels.', ['SEO Strategies', 'Social Media Ads', 'Content Funnels', 'Analytics & ROI'], 16, 85],
            ['Cloud Computing', sec.id, sub.cloud.id, 'Intermediate', I.ama, 'photo-1451187580459-43490279c0fa', 'RWbOihx6-bQ', 'Deploy and manage scalable cloud architectures across major platforms.', ['Cloud Basics', 'AWS & Vercel', 'Serverless Functions', 'DevOps Pipelines'], 26, 30],
            ['Blockchain', dev.id, sub.chain.id, 'Advanced', I.faculty, 'photo-1639762681485-074b7f938ba0', 'gyMwXuJrbJQ', 'Understand distributed ledgers, smart contracts and decentralised apps.', ['Blockchain Basics', 'Solidity Smart Contracts', 'DApp Architecture', 'Security Audits'], 30, 8]
        ];
        const courses = { web };
        catalog.forEach(([title, categoryId, subcategoryId, level, instructor, img, vid, short, modules, hours, age]) => {
            const c = mk({ age, data: {
                title, instructorId: instructor.id, categoryId, subcategoryId, level, estimatedHours: hours, thumbnail: IMG(img), shortDescription: short, featured: age < 25,
                description: short + '\n\nThis program is organised into ' + modules.length + ' modules. Each one combines short video lessons, readings and hands-on practice, and the program ends with a project you can add to your portfolio.',
                requirements: level === 'Beginner' ? ['No prior experience needed', 'A computer with internet access'] : ['Comfort with basic programming concepts', 'A computer with internet access'],
                outcomes: modules.map(m => 'Apply ' + m.toLowerCase() + ' in real projects').concat(['Complete a portfolio-ready capstone project']),
                audience: ['Career starters and career changers', 'Professionals upskilling in ' + title]
            } });
            courses[title] = c;
            modules.forEach((m, i) => sectionWith(c.id, m, 'Core concepts and practice for ' + m.toLowerCase() + '.', [
                { title: m + ': Overview', type: 'video', video: yt + vid, durationMin: 8 + i * 2, isPreview: i === 0, summary: 'Key ideas behind ' + m.toLowerCase() + '.' },
                { title: m + ': In practice', type: 'article', durationMin: 10, summary: 'A guided walkthrough with examples.', article: '## ' + m + ' in practice\n\nIn this reading you will work through a realistic example step by step.\n\n- Understand the problem\n- Apply the technique\n- Check your result\n\n> Tip: pause and try each step yourself before reading on.' }
            ]));
            sectionWith(c.id, 'Capstone Project', 'Apply everything you learned.', [
                { title: title + ' Capstone', type: 'assignment', durationMin: 180, summary: 'Build and submit your capstone project.', assignment: { title: title + ' Capstone', maxScore: 100, dueDays: 28, instructions: 'Complete a project that demonstrates the skills from every module. Submit a link and a short write-up of your approach.', rubric: [{ criterion: 'Technical quality', points: 50, description: '' }, { criterion: 'Completeness', points: 30, description: '' }, { criterion: 'Write-up', points: 20, description: '' }] } }
            ]);
        });
        // A free taster course
        db.update('courses', courses['Coding'].id, { isFree: true, price: 0 });
        // AI course gets a knowledge check, placed before its capstone
        sectionWith(courses['Artificial Intelligence (AI)'].id, 'Knowledge Check', 'Confirm your understanding before the capstone.', [
            { title: 'Generative AI Quiz', type: 'quiz', durationMin: 10, questions: [
                { type: 'single', prompt: 'What is a "prompt" in generative AI?', options: opt('The model\'s training data', 'The instruction or input you give the model', 'A type of GPU', 'The model\'s output'), correct: ['o2'], explanation: 'A prompt is the input that steers what the model produces.' },
                { type: 'truefalse', prompt: 'Large language models can produce confident but incorrect answers.', options: opt('True', 'False'), correct: ['o1'], explanation: 'This is often called hallucination, which is why outputs need checking.' }
            ] }
        ]);
        const aiIds = db.ordered('sections', { courseId: courses['Artificial Intelligence (AI)'].id }).map(s => s.id);
        aiIds.splice(aiIds.length - 2, 0, aiIds.pop());
        db.reorder('sections', aiIds);

        // ---------- Sample learners, progress and activity ----------
        const people = [['Margaret Asante', 'margaret@gmail.com'], ['Kwame Boateng', 'kwame@gmail.com'], ['Efua Mensah', 'efua@gmail.com'], ['David Okafor', 'david@gmail.com'], ['Aisha Bello', 'aisha@gmail.com'], ['Samuel Adjei', 'samuel@gmail.com']];
        const users = people.map(([name, email], i) => db.insert('users', { role: 'student', name, email, password: 'student123', createdAt: ago(40 - i * 5) }));
        const enrolAt = (u, c, days, paid, pct) => {
            const order = db.insert('orders', { userId: u.id, couponId: null, subtotal: L.priceOf(c), discount: 0, total: L.priceOf(c), currency: 'USD', status: paid || !L.priceOf(c) ? 'paid' : 'pending', provider: 'manual', paidAt: paid ? ago(days - 7) : null, createdAt: ago(days) });
            db.insert('order_items', { orderId: order.id, courseId: c.id, price: L.priceOf(c) });
            if (paid && L.priceOf(c)) db.insert('payments', { orderId: order.id, amount: order.total, currency: 'USD', provider: 'manual', providerRef: '', status: 'succeeded', createdAt: ago(days - 7) });
            const e = db.insert('enrollments', { userId: u.id, courseId: c.id, status: paid ? 'active' : 'trial', enrolledAt: ago(days), trialEndsAt: new Date(Date.now() - (days - 7) * DAY).toISOString(), orderId: order.id, currentLessonId: null, lastAccessAt: ago(Math.min(days, Math.floor(Math.random() * 6))), source: 'checkout', createdAt: ago(days) });
            const lessons = L.flatLessons(c.id), n = Math.round(lessons.length * pct / 100);
            lessons.slice(0, n).forEach((l, i) => {
                if (l.type === 'quiz') { const q = L.quizOf(l.id), qs = L.questionsOf(q.id), answers = {}; qs.forEach(x => answers[x.id] = x.correct); L.submitQuiz(u.id, q.id, answers); }
                else if (l.type === 'assignment') L.submitAssignment(u.id, L.assignmentOf(l.id).id, { text: 'Live site: https://example.com/portfolio\nRepository: https://github.com/example/portfolio' });
                else db.insert('lesson_progress', { userId: u.id, lessonId: l.id, status: 'completed', videoPositionSec: 0, videoWatchedPct: 100, completedAt: ago(days - 1 - i * .3) });
            });
            if (lessons[n]) db.update('enrollments', e.id, { currentLessonId: lessons[n].id });
            if (n === lessons.length) db.update('enrollments', e.id, { status: 'completed', completedAt: ago(2) });
            return e;
        };
        enrolAt(users[0], web, 30, true, 67);
        enrolAt(users[0], courses['UI/UX Design'], 6, false, 20);
        enrolAt(users[1], web, 25, true, 100);
        enrolAt(users[1], courses['Artificial Intelligence (AI)'], 3, false, 10);
        enrolAt(users[2], web, 18, true, 40);
        enrolAt(users[2], courses['Data Science'], 12, true, 55);
        enrolAt(users[3], courses['Cybersecurity'], 20, true, 75);
        enrolAt(users[3], web, 9, false, 15);
        enrolAt(users[4], courses['Coding'], 15, true, 90);
        enrolAt(users[4], courses['Digital Marketing'], 4, false, 30);
        enrolAt(users[5], courses['Machine Learning'], 14, false, 25);
        enrolAt(users[5], courses['Cloud Computing'], 22, true, 50);
        // Grade Kwame's final project and issue his certificate
        const kwameSub = db.first('submissions', s => s.userId === users[1].id);
        if (kwameSub) L.gradeSubmission(kwameSub.id, { score: 88, feedback: 'Excellent work: clean semantic markup and a genuinely responsive layout. Consider adding a contact form next.' });
        L.issueCertificate(users[1].id, web.id);

        // Reviews (sample). Hidden by default so invented feedback never shows on the public site as real learner reviews.
        // Admin → Reviews can publish them for demos; real reviews are published as normal.
        const rv = (u, c, rating, comment, d) => db.insert('reviews', { userId: u.id, courseId: c.id, rating, comment, status: 'hidden', sample: true, createdAt: ago(d) });
        rv(users[1], web, 5, 'The structure made it easy to keep going. I finished with a portfolio site I am proud of.', 3);
        rv(users[0], web, 5, 'Clear lessons, and the quizzes made sure I actually understood each section.', 8);
        rv(users[2], courses['Data Science'], 4, 'Practical and well paced. The Pandas module was my favourite.', 5);
        rv(users[3], courses['Cybersecurity'], 5, 'Real-world examples throughout. I now understand how attacks actually work.', 6);
        rv(users[4], courses['Coding'], 5, 'Perfect first course. I had never written code before.', 4);

        db.insert('coupons', { code: 'WELCOME20', type: 'percent', value: 20, maxUses: 100, used: 3, expiresAt: null, courseId: null, active: true });
        db.insert('announcements', { courseId: null, title: 'Welcome to the new learning experience', body: 'Courses are now organised into sections and lessons, with progress tracking and certificates.', authorName: 'Tech Oasis School' });
        db.insert('announcements', { courseId: web.id, title: 'Live Q&A this Friday', body: 'Bring your questions about the final project.', authorName: 'Clifford Mensah' });
        const firstWebLesson = L.flatLessons(web.id)[0];
        const d1 = db.insert('discussions', { courseId: web.id, lessonId: firstWebLesson.id, userId: users[0].id, parentId: null, body: 'Excited to start! Is there a community channel for students?', createdAt: ago(10) });
        db.insert('discussions', { courseId: web.id, lessonId: firstWebLesson.id, userId: users[1].id, parentId: d1.id, body: 'Yes, check the announcements; there is a weekly live Q&A too.', createdAt: ago(9) });
    };

    // Browsers that already hold the earlier seed data: hide sample reviews (written by the sample learners) from the public site
    const SAMPLE_LEARNERS = ['margaret@gmail.com', 'kwame@gmail.com', 'efua@gmail.com', 'david@gmail.com', 'aisha@gmail.com', 'samuel@gmail.com'];
    (TOS.migrations = TOS.migrations || []).push(function (db) {
        db.all('reviews').forEach(r => {
            if (r.status !== 'published' || r.sample) return;
            const u = db.get('users', r.userId);
            if (u && SAMPLE_LEARNERS.includes((u.email || '').toLowerCase())) db.update('reviews', r.id, { status: 'hidden', sample: true });
        });
    });
})();
