# Owner and client walkthrough

Use sample data for the demonstration. To compare permissions, use two separate browser profiles: one for the studio owner and one for the client. A second tab in the same browser profile normally shares the same session.

## 1. Open a workspace

Run the local quickstart in the README and open the printed URL. Create an account, then give your workspace a name such as **NNT Creative Studio**. The first account owns that workspace.

For a quick visual tour, use the isolated demo action. Each invocation creates disposable sample records in its own account/workspace. It does not reveal a common password or give access to another visitor's data.

## 2. Turn a brief into a project

Create a project with a title, client name/contact email, service, description, estimated budget, and due date. For example:

> A small bakery needs a responsive catalogue, opening hours, and a contact page. The first milestone is a homepage proposal; delivery is due next month.

The project should appear in the project list and dashboard after saving. Open it, add a task such as **Prepare homepage wireframe**, and move that task through its statuses. Refresh to confirm the server has saved the change.

Budget is informational and does not charge a card or send an invoice.

## 3. Invite a client

As the owner, create an invitation from the project and copy the join link. Share it with the intended person through a channel you control; the portal does not send an email.

Open the link in the client browser profile, sign in or create a client account, and redeem it. The client should see the invited project. The same invitation cannot be reused, and it expires after seven days.

The link is a secret: whoever holds it can redeem it while signed in. The email entered in the project brief does not prove the recipient's identity.

## 4. Exchange a file and feedback

As the client, open Files and upload a small PNG, JPEG, WebP, PDF, or UTF-8 text file. The limit is 8 MiB per file, 20 files per project, and 40 MiB total per project. Download it to check the authorized attachment flow.

Open Feedback and leave a comment such as **Please make the opening hours more visible on mobile**. The owner should see the comment and the uploaded file after refreshing the project. The client can upload and download, but file deletion is reserved for the owner.

## 5. Request and record approval

As the owner, add a milestone or select an existing one and mark it ready for review. As the client, approve that ready milestone. The resulting status and activity entry should be visible to both parties.

A client cannot approve a pending milestone; the owner cannot approve on the client's behalf. This is a delivery-status record, not an e-signature service.

## 6. Demonstrate the access boundary

Create a second project as the owner without inviting the client. The client should not see it in bootstrap/project lists and should not be able to read or mutate it by guessing its URL or ID.

Sign out and revisit a protected project. The app should ask for authentication, and its write endpoints should reject unauthenticated requests.

## ภาษาไทย: เล่าเดโมใน 3 นาที

1. **ปัญหา:** ฟรีแลนซ์กับลูกค้าตามงานผ่านหลายแชต จึงรวม brief งาน ไฟล์ feedback และการอนุมัติไว้ที่เดียว
2. **ฝั่งเจ้าของ:** สร้างโปรเจกต์ เพิ่ม task และ milestone แล้วส่งลิงก์เชิญ
3. **ฝั่งลูกค้า:** เข้าร่วมเฉพาะโปรเจกต์ที่ได้รับเชิญ อัปโหลดไฟล์ ส่ง feedback และอนุมัติงานที่พร้อมแล้ว
4. **เบื้องหลัง:** ทุกครั้งที่อ่านหรือแก้ข้อมูล server ตรวจ session และสิทธิ์โปรเจกต์ ไฟล์เก็บใน private bucket
5. **ขอบเขต:** เวอร์ชันนี้ยังไม่มีระบบจ่ายเงิน ส่งอีเมล หรือ AI เน้นให้ workflow หลักทำงานครบก่อน
