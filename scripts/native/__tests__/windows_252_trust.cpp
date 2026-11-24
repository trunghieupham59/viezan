// Keep this probe aligned with NativeUpdates::openInstaller() in tag v2.5.2.
#include <windows.h>
#include <softpub.h>
#include <wintrust.h>
#include <cstdio>
#include <cwchar>

int wmain(int argc, wchar_t **argv) {
    if (argc != 3) return 1;
    WINTRUST_FILE_INFO file{};
    file.cbStruct = sizeof(file);
    file.pcwszFilePath = argv[1];

    WINTRUST_DATA trust{};
    trust.cbStruct = sizeof(trust);
    trust.dwUIChoice = WTD_UI_NONE;
    trust.fdwRevocationChecks = WTD_REVOKE_WHOLECHAIN;
    trust.dwUnionChoice = WTD_CHOICE_FILE;
    trust.pFile = &file;
    trust.dwStateAction = WTD_STATEACTION_VERIFY;
    GUID policy = WINTRUST_ACTION_GENERIC_VERIFY_V2;
    const LONG result = WinVerifyTrust(nullptr, &policy, &trust);
    trust.dwStateAction = WTD_STATEACTION_CLOSE;
    WinVerifyTrust(nullptr, &policy, &trust);
    std::printf("Windows 2.5.2 WinVerifyTrust result: 0x%08lx\n", static_cast<unsigned long>(result));
    if (std::wcscmp(argv[2], L"Valid") == 0 && result == ERROR_SUCCESS) return 0;
    if (std::wcscmp(argv[2], L"NotSigned") == 0 && result == TRUST_E_NOSIGNATURE) return 0;
    return 1;
}
