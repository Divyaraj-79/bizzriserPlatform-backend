
async function testWorkingHours() {
  const timezone = 'Asia/Kolkata';
  const schedule = {
    monday: { enabled: true, open: '09:00', close: '18:00', breakStart: '13:00', breakEnd: '14:00' },
    sunday: { enabled: false }
  };
  const holidays = ['2026-05-27'];

  function check(date) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        weekday: 'long',
    });

    const parts = formatter.formatToParts(date);
    const getPart = (type) => parts.find(p => p.type === type)?.value;

    const weekday = getPart('weekday').toLowerCase(); 
    const dateStr = `${getPart('year')}-${getPart('month')}-${getPart('day')}`; 
    const timeStr = `${getPart('hour')}:${getPart('minute')}`;

    console.log(`Checking ${date.toISOString()} -> TZ: ${timezone}, Day: ${weekday}, Date: ${dateStr}, Time: ${timeStr}`);

    if (holidays.includes(dateStr)) return 'closed (holiday)';
    
    const dayConfig = schedule[weekday];
    if (!dayConfig || !dayConfig.enabled) return 'closed (day disabled)';

    const { open, close, breakStart, breakEnd } = dayConfig;
    const isWithinHours = timeStr >= (open || '00:00') && timeStr <= (close || '23:59');
    if (!isWithinHours) return 'closed (outside hours)';

    if (breakStart && breakEnd) {
        const isWithinBreak = timeStr >= breakStart && timeStr <= breakEnd;
        if (isWithinBreak) return 'closed (break)';
    }

    return 'open';
  }

  // Monday May 25, 2026 10:00 AM IST (04:30 AM UTC)
  console.log('Result:', check(new Date('2026-05-25T04:30:00Z'))); // Expect Open

  // Monday May 25, 2026 01:30 PM IST (08:00 AM UTC)
  console.log('Result:', check(new Date('2026-05-25T08:00:00Z'))); // Expect Closed (Break)

  // Sunday May 24, 2026
  console.log('Result:', check(new Date('2026-05-24T10:00:00Z'))); // Expect Closed (Sunday)

  // Holiday May 27, 2026
  console.log('Result:', check(new Date('2026-05-27T10:00:00Z'))); // Expect Closed (Holiday)
}

testWorkingHours();
