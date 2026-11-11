-- ============================================================
-- TEST DATA: 5 reference TAFs + 1 test TAF for "Analyze TAF"
-- ============================================================
--
-- STEP 1 — Find your student UUIDs:
--    Run this in your Supabase SQL Editor first:
--
--       SELECT id, email, first_name, last_name
--       FROM public.profiles
--       WHERE role = 'student';
--
--    Pick TWO different students (or create a second account).
--    Copy their UUIDs and paste below.
--
-- STEP 2 — Replace the placeholders below:
--    @student_1 — the student who "owns" the 5 reference TAFs
--    @student_2 — a DIFFERENT student who will run the Analyze
--

-- ============================================================
-- 5 REFERENCE TAFs (these will appear as "internal matches")
-- All must have status 'submitted' or 'analyzed' so the
-- analysis engine picks them up.
-- ============================================================

INSERT INTO public.topic_abstract_forms
  (student_id, proposed_title, background, objectives, literature_review, methodology, reference_list, status, submitted_at)
VALUES
(
  '0f88af61-786c-4ef8-840c-3c9919a37cfb',
  'A Mobile Application for Campus Event Management',
  'Universities host numerous events such as seminars, workshops, and student organization activities. However, students often miss these events due to lack of an efficient announcement system. Current methods rely on Facebook posts and printed posters which are not centralized. There is a need for a dedicated mobile application that aggregates all campus events in real time and allows students to register, receive notifications, and rate events afterward.',
  '1. To design and develop a mobile application for campus event management. 2. To implement push notifications for upcoming events. 3. To provide a feedback and rating system for event attendees.',
  'Studies have shown that 70% of students rely on social media for campus announcements, leading to missed events due to algorithmic filtering. Similar systems like Eventbrite focus on external events while existing campus solutions lack mobile optimization. This study fills the gap of a university-specific, real-time event management platform with built-in notification and feedback features.',
  'The study will use the Agile Scrum methodology. The frontend will be built using React Native for cross-platform compatibility. The backend will use Node.js and Express with a PostgreSQL database. Push notifications will be implemented using Firebase Cloud Messaging. The system will be tested using black-box testing and user acceptance testing with 50 student respondents.',
  '1. Smith, J. (2022). Mobile Event Management Systems: A Review. Journal of Information Technology, 15(2), 45-58. 2. Brown, A. (2023). Push Notification Effectiveness in Academic Settings. International Journal of Mobile Computing, 8(1), 112-125.',
  'submitted',
  NOW() - INTERVAL '7 days'
);

INSERT INTO public.topic_abstract_forms
  (student_id, proposed_title, background, objectives, literature_review, methodology, reference_list, status, submitted_at)
VALUES
(
  '0f88af61-786c-4ef8-840c-3c9919a37cfb',
  'IoT-Based Classroom Monitoring System with Real-Time Environmental Sensing',
  'Classroom conditions such as temperature, humidity, and air quality directly affect student learning performance. Current classroom monitoring in the university is done manually, with no real-time data collection or alert systems. Faculty and administrators lack visibility into environmental conditions that may hinder effective teaching and learning.',
  '1. To develop an IoT-based classroom monitoring system using environmental sensors. 2. To create a real-time dashboard for faculty and administrators. 3. To implement automated alerts when environmental parameters exceed thresholds.',
  'Existing studies have implemented IoT monitoring in smart buildings and industrial settings, but few focus on classroom environments in Philippine universities. Research by Cruz et al. (2023) demonstrated that classroom temperature above 30°C reduces student concentration by 25%. This study adapts IoT monitoring specifically for academic classroom settings.',
  'The system will use ESP32 microcontrollers with DHT22 temperature/humidity sensors and MQ-135 air quality sensors. Data will be transmitted via Wi-Fi to a Raspberry Pi gateway. The backend will use Python Flask with a time-series database. The dashboard will be built using React.js with real-time charts powered by WebSockets.',
  '1. Cruz, M. et al. (2023). Environmental Factors Affecting Student Performance. Philippine Journal of Computing, 12(1), 78-92. 2. Garcia, R. (2022). IoT in Education: A Systematic Review. International Journal of Emerging Technologies, 17(4), 201-218.',
  'submitted',
  NOW() - INTERVAL '5 days'
);

INSERT INTO public.topic_abstract_forms
  (student_id, proposed_title, background, objectives, literature_review, methodology, reference_list, status, submitted_at)
VALUES
(
  '0f88af61-786c-4ef8-840c-3c9919a37cfb',
  'Online Document Request and Tracking System for University Records',
  'The university registrar receives hundreds of document requests daily, including transcript of records, certificates of enrollment, and diploma requests. The current process requires students to fill out physical forms and visit the registrar office multiple times, causing long queues and delays. There is no online tracking mechanism for request status.',
  '1. To design and develop an online document request and tracking system. 2. To implement a real-time status tracking feature for requestors. 3. To integrate digital payment for processing fees.',
  'Digital transformation in higher education has accelerated, yet many registrar processes remain paper-based. Santos (2022) found that 65% of students prefer online document requests over in-person transactions. Existing systems like DocuSign are enterprise-focused and not tailored to university registrar workflows.',
  'The system will be developed using Laravel PHP framework with a MySQL database. The frontend will use Bootstrap for responsive design. QR code generation will be implemented for document verification. Payment integration will use GCash API. Testing will follow the V-Model methodology with 100 end-user respondents.',
  '1. Santos, L. (2022). Digital Transformation in Philippine Universities. Asian Journal of Education and Technology, 9(3), 156-172. 2. Reyes, J. (2023). Online Document Management Systems. Philippine Information Technology Journal, 14(1), 34-49.',
  'submitted',
  NOW() - INTERVAL '3 days'
);

INSERT INTO public.topic_abstract_forms
  (student_id, proposed_title, background, objectives, literature_review, methodology, reference_list, status, submitted_at)
VALUES
(
  '0f88af61-786c-4ef8-840c-3c9919a37cfb',
  'AI-Powered Student Attendance System Using Facial Recognition',
  'Traditional methods of taking student attendance, such as calling names or signing paper sheets, are time-consuming and prone to inaccuracies and proxy attendance. With the increasing class sizes, there is a pressing need for an automated, contactless attendance system that can accurately identify students and log their presence in real time.',
  '1. To develop an attendance system using facial recognition technology. 2. To implement real-time attendance logging and reporting. 3. To evaluate the accuracy of the facial recognition model under various lighting conditions.',
  'Facial recognition technology has matured significantly, with accuracy rates exceeding 99% in controlled environments. Studies by Lee et al. (2023) demonstrated successful deployment in classroom settings, though challenges remain with mask-wearing and varying lighting. This study builds on existing work by optimizing the model for Philippine classroom conditions.',
  'The system will use a convolutional neural network (CNN) based on the FaceNet architecture. The frontend will be a web application built with React.js. The backend will use Python FastAPI with a PostgreSQL database. The model will be trained on a dataset of 500 student faces collected from the university. Performance will be measured using precision, recall, and F1-score.',
  '1. Lee, H. et al. (2023). Facial Recognition in Educational Settings. IEEE Transactions on Learning Technologies, 16(2), 234-248. 2. Mendoza, P. (2022). AI Applications in Philippine Education. Philippine Computing Journal, 18(1), 45-62.',
  'submitted',
  NOW() - INTERVAL '2 days'
);

INSERT INTO public.topic_abstract_forms
  (student_id, proposed_title, background, objectives, literature_review, methodology, reference_list, status, submitted_at)
VALUES
(
  '0f88af61-786c-4ef8-840c-3c9919a37cfb',
  'E-Learning Platform with Gamification Elements for Programming Courses',
  'First-year computer science students often struggle with introductory programming courses due to the abstract nature of the subject. Traditional lecture-based instruction fails to engage students, resulting in high dropout rates. Gamification — the application of game design elements in non-game contexts — has shown promise in improving student motivation and learning outcomes.',
  '1. To develop an e-learning platform with gamification features for programming courses. 2. To implement achievement badges, leaderboards, and experience points. 3. To measure the impact of gamification on student engagement and performance.',
  'Research by Deterding et al. (2021) established that gamification increases student motivation by up to 40%. Platforms like Codecademy and Duolingo have successfully used gamification for skill-based learning. However, most existing platforms are not tailored to the Philippine tertiary education curriculum specifically for programming subjects.',
  'The platform will be developed using Next.js for the frontend and Django for the backend. PostgreSQL will be used for data storage. Gamification features include experience points (XP), achievement badges, progress bars, and a leaderboard system. The study will use a quasi-experimental design comparing students using the gamified platform against a control group using traditional methods.',
  '1. Deterding, S. et al. (2021). Gamification in Education: A Meta-Analysis. Computers & Education, 165, 104-123. 2. Tan, K. (2022). Programming Education in the Philippines. Asian Journal of Computer Science, 11(2), 89-104.',
  'submitted',
  NOW() - INTERVAL '1 day'
);

-- ============================================================
-- 1 TEST TAF (the one you will click "Analyze TAF" on)
-- Intentionally similar to reference #1 (event management)
-- so you can see the similarity engine work.
-- ============================================================

INSERT INTO public.topic_abstract_forms
  (student_id, proposed_title, background, objectives, literature_review, methodology, reference_list, status)
VALUES
(
  '60aa4980-30e1-436f-a381-b9011b294eaf',
  'Mobile-Based Campus Event Management System with Real-Time Notifications and QR Code Attendance',
  'Campus events are an integral part of student life, yet the university lacks a centralized mobile platform for event discovery, registration, and attendance tracking. Currently, event information is scattered across Facebook pages, department bulletin boards, and word of mouth. This fragmented approach results in low student participation and difficulty for event organizers in managing attendees. A mobile-based system that integrates event listings, push notifications, and QR code-based attendance tracking would streamline the entire event lifecycle.',
  '1. To develop a cross-platform mobile application for campus event management. 2. To implement real-time push notifications for event announcements and reminders. 3. To integrate QR code-based attendance tracking for event organizers. 4. To evaluate user satisfaction and system usability among students and organizers.',
  'Mobile event management has been explored in various contexts. Eventbrite provides a robust platform but is designed for public events, not campus-specific use. Local studies by Dela Cruz (2023) surveyed student event participation and found that 78% of students missed events due to lack of timely notifications. Existing campus portals like the university website are not mobile-optimized and lack push notification capabilities. This study addresses the gap by providing a mobile-first, campus-specific solution with integrated attendance tracking.',
  'The application will be developed using React Native for cross-platform compatibility (iOS and Android). The backend will use Node.js with Express and a PostgreSQL database. Push notifications will be implemented using Firebase Cloud Messaging. QR code generation will use the qrcode library, and scanning will use the device camera via Expo Camera API. The system will follow the Agile Scrum methodology with two-week sprints. User acceptance testing will be conducted with 100 students and 10 event organizers.',
  '1. Dela Cruz, M. (2023). Student Event Participation in Philippine Universities. Philippine Educational Research Journal, 8(1), 45-60. 2. Wilson, T. (2022). QR Code Technology for Event Management. International Journal of Event Management, 5(2), 112-128. 3. Patel, R. (2023). Mobile Applications in Higher Education. Journal of Educational Technology, 19(3), 201-219.',
  'draft'
);
