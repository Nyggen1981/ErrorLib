import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const abb = await prisma.brand.upsert({
    where: { slug: "abb" },
    update: {},
    create: { name: "ABB", slug: "abb" },
  });

  const siemens = await prisma.brand.upsert({
    where: { slug: "siemens" },
    update: {},
    create: { name: "Siemens", slug: "siemens" },
  });

  const acs550 = await prisma.manual.upsert({
    where: { slug: "acs550" },
    update: {},
    create: {
      name: "ACS550",
      slug: "acs550",
      brandId: abb.id,
    },
  });

  const g120 = await prisma.manual.upsert({
    where: { slug: "sinamics-g120" },
    update: {},
    create: {
      name: "SINAMICS G120",
      slug: "sinamics-g120",
      brandId: siemens.id,
    },
  });

  const abbFaults = [
    {
      code: "F0001",
      slug: "f0001-overcurrent",
      title: "Overcurrent",
      description:
        "The drive has detected current exceeding the safe operating threshold. This typically occurs due to a short circuit in the motor cables, a ground fault, or sudden mechanical overload on the motor shaft. Prolonged overcurrent conditions can damage the power stage of the drive.",
      fixSteps: [
        "Check motor cables for short circuits or ground faults using a megger.",
        "Disconnect the motor and run the drive without load to isolate the fault.",
        "Inspect the motor for winding damage or bearing seizure.",
        "Verify the drive's current limit settings match the motor nameplate.",
        "Check for sudden mechanical overloads on the driven equipment.",
        "If the fault persists with motor disconnected, the drive output stage may be damaged.",
      ],
    },
    {
      code: "F0002",
      slug: "f0002-overvoltage",
      title: "Overvoltage",
      description:
        "The DC bus voltage has exceeded the maximum safe level. This commonly happens during rapid deceleration when regenerative energy from the motor flows back into the drive. Incoming power supply surges or an incorrectly sized braking resistor can also trigger this fault.",
      fixSteps: [
        "Increase the deceleration ramp time to reduce regenerative energy.",
        "Verify the supply voltage is within the rated range of the drive.",
        "Check and size the braking resistor correctly if installed.",
        "Enable the overvoltage controller in the drive parameters.",
        "Inspect the DC bus capacitors for signs of degradation.",
      ],
    },
    {
      code: "F0016",
      slug: "f0016-earth-fault",
      title: "Earth Fault",
      description:
        "An earth (ground) fault has been detected between the motor phases and earth. This is a critical safety fault indicating insulation breakdown in the motor windings, damage to the output cables, or moisture ingress into the motor or junction box.",
      fixSteps: [
        "Disconnect the motor cable from the drive output terminals.",
        "Measure insulation resistance between each phase and earth using a megger (should be >1 MΩ).",
        "Inspect motor cable routing for physical damage or pinch points.",
        "Check the motor junction box for moisture, corrosion, or loose connections.",
        "If insulation is low, the motor windings may need replacement or re-insulation.",
        "Verify proper cable shielding and grounding practices.",
      ],
    },
  ];

  for (const fc of abbFaults) {
    await prisma.faultCode.upsert({
      where: { slug: fc.slug },
      update: {
        title: fc.title,
        description: fc.description,
        fixSteps: fc.fixSteps,
      },
      create: {
        ...fc,
        manualId: acs550.id,
      },
    });
  }

  const siemensFaults = [
    {
      code: "F07011",
      slug: "f07011-motor-overtemperature",
      title: "Motor Overtemperature",
      description:
        "The motor temperature sensor has reported a temperature exceeding the configured threshold. This may indicate continuous operation above rated load, insufficient cooling, blocked ventilation, or a faulty temperature sensor (PTC/KTY).",
      fixSteps: [
        "Check the motor cooling fan is operating correctly.",
        "Verify the motor is not continuously running above its rated current.",
        "Clean dust and debris from the motor cooling fins.",
        "Check the PTC/KTY sensor wiring and connections.",
        "Verify the temperature threshold settings in the drive parameters.",
        "Reduce the load or duty cycle if the motor is undersized.",
      ],
    },
    {
      code: "F07801",
      slug: "f07801-motor-phase-failure",
      title: "Motor Phase Failure",
      description:
        "The drive has detected that one or more motor phases are missing. This typically indicates a broken cable, loose connection, blown fuse on the output side, or a disconnected motor. Running a motor with a missing phase causes severe overheating.",
      fixSteps: [
        "Check all three motor cable connections at the drive terminals.",
        "Verify motor cable continuity with a multimeter.",
        "Inspect the motor terminal box for loose or corroded connections.",
        "Check for blown fuses in the output circuit if applicable.",
        "Measure motor winding resistance (all three phases should be balanced).",
      ],
    },
  ];

  for (const fc of siemensFaults) {
    await prisma.faultCode.upsert({
      where: { slug: fc.slug },
      update: {
        title: fc.title,
        description: fc.description,
        fixSteps: fc.fixSteps,
      },
      create: {
        ...fc,
        manualId: g120.id,
      },
    });
  }

  console.log("Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
