using System;
using System.Linq;
using EfCoreTestProject;
using Microsoft.EntityFrameworkCore;

Console.WriteLine("Starting EF Core Test...");

using (var db = new AppDbContext())
{
    Console.WriteLine("Checking database...");
    // Just accessing the DbSet to ensure EF Core warms up/is used
    var count = db.Blogs.Count(); 
    Console.WriteLine($"Found {count} blogs.");
}

Console.WriteLine("Done.");

while (true)
{
    Console.WriteLine("Press any key to exit...");
    Console.ReadKey();
}
