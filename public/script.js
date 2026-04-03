window.addEventListener('load', () => {
    document.body.classList.add('loaded');
});

document.addEventListener('DOMContentLoaded', () => {
    // AOS Initialization
    setTimeout(() => {
        AOS.init({
            duration: 800,
            once: true,
            offset: 100
        });
    }, 100);

    const header = document.getElementById('header');
    const navMenu = document.getElementById('nav-menu');
    const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    const navLinks = document.querySelectorAll('.nav-link');
    const contactForm = document.getElementById('contact-form');
    const formMessage = document.getElementById('form-message');
    const submitBtn = document.getElementById('submit-btn');

    // 1. Header Scroll Effect
    window.addEventListener('scroll', () => {
        if (header) {
            header.classList.toggle('scrolled', window.scrollY > 50);
        }
    });

    // 2. Mobile Menu Toggle
    if (mobileNavToggle && navMenu) {
        mobileNavToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = navMenu.classList.toggle('active');
            const icon = mobileNavToggle.querySelector('i');
            icon.className = isOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
        });
    }

    // 3. Global Smooth Scroll for ALL Hash Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();

                // Close mobile menu if open
                if (navMenu && navMenu.classList.contains('active')) {
                    navMenu.classList.remove('active');
                    const icon = mobileNavToggle.querySelector('i');
                    if (icon) icon.className = 'fa-solid fa-bars';
                }

                // Smooth scroll
                const headerOffset = 80;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // 4. ScrollSpy: Highlight active nav link on scroll
    const sections = document.querySelectorAll('section[id]');

    window.addEventListener('scroll', () => {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (pageYOffset >= (sectionTop - 150)) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').includes(current)) {
                link.classList.add('active');
            }
        });
    });

    // 5. Backend Form Handling (AJAX)
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // UI state: Loading
            submitBtn.classList.add('submitting');
            submitBtn.disabled = true;
            submitBtn.querySelector('.btn-loader').style.display = 'inline-block';
            formMessage.style.display = 'none';

            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());

            try {
                // Send request to the backend
                const response = await fetch('/api/enroll', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (result.success) {
                    // Success UI
                    formMessage.textContent = 'شکریہ! آپ کی درخواست موصول ہو گئی ہے۔ ہم جلد آپ سے رابطہ کریں گے۔';
                    formMessage.className = 'form-success';
                    formMessage.style.display = 'block';
                    contactForm.reset();

                    // Hide message after 5 seconds
                    setTimeout(() => {
                        formMessage.style.display = 'none';
                    }, 5000);
                } else {
                    throw new Error(result.message);
                }

            } catch (error) {
                // Error UI
                formMessage.textContent = 'معذرت! فارم سبمٹ کرنے میں مسئلہ پیش آیا۔ دوبارہ کوشش کریں۔';
                formMessage.className = 'form-error';
                formMessage.style.display = 'block';
                console.error(error);
            } finally {
                // Reset UI
                submitBtn.classList.remove('submitting');
                submitBtn.disabled = false;
                submitBtn.querySelector('.btn-loader').style.display = 'none';
            }
        });
    }
});
