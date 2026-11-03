using DoveBevo.Windows;

var trusted = new[]
{
    "https://www.dovebevo.com/",
    "https://dovebevo.com/bar/n123?c=u0nd9",
};
var untrusted = new[]
{
    "http://www.dovebevo.com/",
    "https://www.dovebevo.com.evil.example/",
    "https://user@www.dovebevo.com/",
    "https://www.dovebevo.com:8443/",
    "file:///C:/temp/private.txt",
};
foreach (var address in trusted)
    Require(NavigationPolicy.IsTrusted(new Uri(address)), "trusted origin rejected");
foreach (var address in untrusted)
    Require(!NavigationPolicy.IsTrusted(new Uri(address)), "untrusted origin accepted");

var venues = new[]
{
    ("https://www.dovebevo.com/bar/n123?c=u0nd9", "n123", true),
    ("https://www.dovebevo.com/mobile/index.html?path=%2Fbar%2Fn123&c=u0nd9", "n123", true),
    ("https://www.dovebevo.com/bar/n123?c=u0nd9", "n124", false),
    ("https://www.dovebevo.com/bar/n123?c=u0nd9&c=u0nd9", "n123", false),
    ("https://www.dovebevo.com/bar/n123?c=u0nd9#secret", "n123", false),
    ("https://www.dovebevo.com/bar/n123?c=u0nd9&next=https://evil.example", "n123", false),
    ("https://www.dovebevo.com/bar/n123?c=aaaaa", "n123", false),
};
foreach (var (address, key, expected) in venues)
    Require(NavigationPolicy.TryVenue(address, key, out _) == expected, "venue route policy mismatch");

Console.WriteLine("Windows navigation policy: 14 origin and venue cases passed.");

static void Require(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}
