import { NextResponse } from "next/server";
import { sendNewLeadAlert } from "@/lib/email";

export async function GET() {
  try {
    const dummyLeads = [
      {
        id: "test_lead_1",
        campaign_name: "Test Campaign Alpha",
        project_name: "Pune Residence",
        field_data: {
          full_name: "John Doe (Test)",
          email: "johndoe@example.com",
          phone_number: "+91 98765 43210"
        }
      },
      {
        id: "test_lead_2",
        campaign_name: "Test Campaign Beta",
        project_name: "Sobo Luxe Residence",
        field_data: {
          full_name: "Jane Smith (Test)",
          email: "janesmith@example.com",
          phone_number: "+91 87654 32109"
        }
      }
    ];

    console.log("Attempting to send test email...");
    const success = await sendNewLeadAlert(dummyLeads);

    if (success) {
      return NextResponse.json({ success: true, message: "Test email sent successfully! Check your inbox." });
    } else {
      return NextResponse.json({ success: false, message: "Failed to send email. Check your server console for Resend API errors." }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Test email route error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
