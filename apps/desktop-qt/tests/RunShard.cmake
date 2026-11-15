# Runs one slice of a QtTest binary: cmake -DTEST_BINARY=... -DSHARD=<0..SHARDS-1>
# -DSHARDS=<n> -DREPORT=<file> -P RunShard.cmake
#
# The binary lists its own cases (-datatags), so every function and data row
# lands in exactly one shard and new cases need no registration here. Rows are
# dealt round-robin, which spreads the large layout matrices across shards.
execute_process(COMMAND "${TEST_BINARY}" -datatags
    OUTPUT_VARIABLE listing RESULT_VARIABLE status OUTPUT_STRIP_TRAILING_WHITESPACE)
if(NOT status EQUAL 0)
    message(FATAL_ERROR "${TEST_BINARY} -datatags failed: ${status}")
endif()
string(REPLACE ";" "\\;" listing "${listing}")
string(REGEX REPLACE "\r?\n" ";" cases "${listing}")
set(selected)
set(index 0)
foreach(case IN LISTS cases)
    # "<Class> <function>" or "<Class> <function> <data tag>"
    if(NOT case MATCHES "^[^ ]+ ([^ ]+)( (.+))?$")
        message(FATAL_ERROR "Unexpected -datatags line: ${case}")
    endif()
    math(EXPR slot "${index} % ${SHARDS}")
    if(slot EQUAL SHARD)
        if(CMAKE_MATCH_3 STREQUAL "")
            list(APPEND selected "${CMAKE_MATCH_1}")
        else()
            list(APPEND selected "${CMAKE_MATCH_1}:${CMAKE_MATCH_3}")
        endif()
    endif()
    math(EXPR index "${index} + 1")
endforeach()
if(NOT selected)
    message(STATUS "Shard ${SHARD}/${SHARDS} has no cases")
    return()
endif()
# Shards run concurrently and the suite writes below QStandardPaths, so each
# one gets its own storage root (see WorkbenchBridgeTests::initTestCase).
set(ENV{VIEZAN_TEST_SHARD} "${SHARD}")
execute_process(COMMAND "${TEST_BINARY}" ${selected} -o "${REPORT},txt" -o -,txt RESULT_VARIABLE status)
if(NOT status EQUAL 0)
    message(FATAL_ERROR "Shard ${SHARD}/${SHARDS} failed: ${status}")
endif()
