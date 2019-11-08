/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 7.0, "minX": 0.0, "maxY": 5888.0, "series": [{"data": [[0.0, 7.0], [0.1, 16.0], [0.2, 19.0], [0.3, 22.0], [0.4, 24.0], [0.5, 26.0], [0.6, 28.0], [0.7, 30.0], [0.8, 31.0], [0.9, 33.0], [1.0, 35.0], [1.1, 37.0], [1.2, 39.0], [1.3, 41.0], [1.4, 43.0], [1.5, 45.0], [1.6, 47.0], [1.7, 49.0], [1.8, 51.0], [1.9, 53.0], [2.0, 55.0], [2.1, 57.0], [2.2, 59.0], [2.3, 61.0], [2.4, 64.0], [2.5, 66.0], [2.6, 68.0], [2.7, 70.0], [2.8, 72.0], [2.9, 74.0], [3.0, 76.0], [3.1, 77.0], [3.2, 79.0], [3.3, 81.0], [3.4, 83.0], [3.5, 85.0], [3.6, 87.0], [3.7, 88.0], [3.8, 90.0], [3.9, 92.0], [4.0, 94.0], [4.1, 96.0], [4.2, 98.0], [4.3, 100.0], [4.4, 101.0], [4.5, 103.0], [4.6, 105.0], [4.7, 106.0], [4.8, 108.0], [4.9, 110.0], [5.0, 111.0], [5.1, 113.0], [5.2, 114.0], [5.3, 116.0], [5.4, 118.0], [5.5, 120.0], [5.6, 121.0], [5.7, 123.0], [5.8, 124.0], [5.9, 126.0], [6.0, 127.0], [6.1, 129.0], [6.2, 130.0], [6.3, 132.0], [6.4, 133.0], [6.5, 135.0], [6.6, 136.0], [6.7, 138.0], [6.8, 139.0], [6.9, 140.0], [7.0, 142.0], [7.1, 144.0], [7.2, 145.0], [7.3, 146.0], [7.4, 148.0], [7.5, 149.0], [7.6, 151.0], [7.7, 152.0], [7.8, 153.0], [7.9, 155.0], [8.0, 156.0], [8.1, 158.0], [8.2, 159.0], [8.3, 160.0], [8.4, 162.0], [8.5, 163.0], [8.6, 164.0], [8.7, 166.0], [8.8, 167.0], [8.9, 168.0], [9.0, 170.0], [9.1, 171.0], [9.2, 172.0], [9.3, 174.0], [9.4, 175.0], [9.5, 176.0], [9.6, 178.0], [9.7, 179.0], [9.8, 180.0], [9.9, 182.0], [10.0, 183.0], [10.1, 185.0], [10.2, 186.0], [10.3, 187.0], [10.4, 189.0], [10.5, 190.0], [10.6, 192.0], [10.7, 193.0], [10.8, 194.0], [10.9, 195.0], [11.0, 197.0], [11.1, 198.0], [11.2, 199.0], [11.3, 201.0], [11.4, 202.0], [11.5, 204.0], [11.6, 205.0], [11.7, 206.0], [11.8, 208.0], [11.9, 209.0], [12.0, 210.0], [12.1, 212.0], [12.2, 213.0], [12.3, 215.0], [12.4, 216.0], [12.5, 217.0], [12.6, 219.0], [12.7, 220.0], [12.8, 221.0], [12.9, 223.0], [13.0, 224.0], [13.1, 225.0], [13.2, 227.0], [13.3, 228.0], [13.4, 229.0], [13.5, 230.0], [13.6, 232.0], [13.7, 233.0], [13.8, 235.0], [13.9, 237.0], [14.0, 238.0], [14.1, 239.0], [14.2, 241.0], [14.3, 242.0], [14.4, 244.0], [14.5, 245.0], [14.6, 246.0], [14.7, 248.0], [14.8, 249.0], [14.9, 251.0], [15.0, 252.0], [15.1, 254.0], [15.2, 255.0], [15.3, 257.0], [15.4, 258.0], [15.5, 260.0], [15.6, 262.0], [15.7, 263.0], [15.8, 265.0], [15.9, 266.0], [16.0, 268.0], [16.1, 270.0], [16.2, 271.0], [16.3, 273.0], [16.4, 274.0], [16.5, 276.0], [16.6, 277.0], [16.7, 278.0], [16.8, 280.0], [16.9, 281.0], [17.0, 283.0], [17.1, 285.0], [17.2, 286.0], [17.3, 287.0], [17.4, 289.0], [17.5, 290.0], [17.6, 292.0], [17.7, 293.0], [17.8, 295.0], [17.9, 296.0], [18.0, 298.0], [18.1, 299.0], [18.2, 300.0], [18.3, 302.0], [18.4, 303.0], [18.5, 305.0], [18.6, 306.0], [18.7, 307.0], [18.8, 309.0], [18.9, 310.0], [19.0, 311.0], [19.1, 313.0], [19.2, 314.0], [19.3, 315.0], [19.4, 317.0], [19.5, 318.0], [19.6, 320.0], [19.7, 321.0], [19.8, 323.0], [19.9, 324.0], [20.0, 326.0], [20.1, 327.0], [20.2, 328.0], [20.3, 330.0], [20.4, 331.0], [20.5, 332.0], [20.6, 334.0], [20.7, 335.0], [20.8, 337.0], [20.9, 338.0], [21.0, 340.0], [21.1, 341.0], [21.2, 343.0], [21.3, 344.0], [21.4, 345.0], [21.5, 347.0], [21.6, 348.0], [21.7, 349.0], [21.8, 351.0], [21.9, 352.0], [22.0, 353.0], [22.1, 355.0], [22.2, 356.0], [22.3, 357.0], [22.4, 359.0], [22.5, 360.0], [22.6, 361.0], [22.7, 363.0], [22.8, 364.0], [22.9, 365.0], [23.0, 366.0], [23.1, 368.0], [23.2, 369.0], [23.3, 370.0], [23.4, 371.0], [23.5, 372.0], [23.6, 374.0], [23.7, 375.0], [23.8, 376.0], [23.9, 377.0], [24.0, 379.0], [24.1, 380.0], [24.2, 381.0], [24.3, 382.0], [24.4, 384.0], [24.5, 385.0], [24.6, 386.0], [24.7, 387.0], [24.8, 389.0], [24.9, 390.0], [25.0, 391.0], [25.1, 393.0], [25.2, 394.0], [25.3, 395.0], [25.4, 396.0], [25.5, 397.0], [25.6, 398.0], [25.7, 400.0], [25.8, 401.0], [25.9, 402.0], [26.0, 403.0], [26.1, 405.0], [26.2, 406.0], [26.3, 407.0], [26.4, 408.0], [26.5, 410.0], [26.6, 411.0], [26.7, 412.0], [26.8, 414.0], [26.9, 415.0], [27.0, 416.0], [27.1, 417.0], [27.2, 419.0], [27.3, 420.0], [27.4, 421.0], [27.5, 423.0], [27.6, 424.0], [27.7, 425.0], [27.8, 427.0], [27.9, 428.0], [28.0, 429.0], [28.1, 431.0], [28.2, 432.0], [28.3, 434.0], [28.4, 436.0], [28.5, 437.0], [28.6, 438.0], [28.7, 439.0], [28.8, 441.0], [28.9, 442.0], [29.0, 444.0], [29.1, 445.0], [29.2, 446.0], [29.3, 448.0], [29.4, 449.0], [29.5, 451.0], [29.6, 452.0], [29.7, 454.0], [29.8, 455.0], [29.9, 456.0], [30.0, 458.0], [30.1, 459.0], [30.2, 461.0], [30.3, 463.0], [30.4, 464.0], [30.5, 466.0], [30.6, 467.0], [30.7, 469.0], [30.8, 471.0], [30.9, 472.0], [31.0, 474.0], [31.1, 476.0], [31.2, 477.0], [31.3, 479.0], [31.4, 481.0], [31.5, 483.0], [31.6, 485.0], [31.7, 486.0], [31.8, 488.0], [31.9, 490.0], [32.0, 492.0], [32.1, 494.0], [32.2, 495.0], [32.3, 497.0], [32.4, 499.0], [32.5, 500.0], [32.6, 502.0], [32.7, 504.0], [32.8, 506.0], [32.9, 507.0], [33.0, 509.0], [33.1, 511.0], [33.2, 513.0], [33.3, 514.0], [33.4, 517.0], [33.5, 519.0], [33.6, 521.0], [33.7, 523.0], [33.8, 525.0], [33.9, 527.0], [34.0, 529.0], [34.1, 531.0], [34.2, 532.0], [34.3, 535.0], [34.4, 537.0], [34.5, 539.0], [34.6, 541.0], [34.7, 543.0], [34.8, 545.0], [34.9, 547.0], [35.0, 549.0], [35.1, 551.0], [35.2, 553.0], [35.3, 555.0], [35.4, 557.0], [35.5, 560.0], [35.6, 562.0], [35.7, 564.0], [35.8, 566.0], [35.9, 568.0], [36.0, 570.0], [36.1, 572.0], [36.2, 573.0], [36.3, 575.0], [36.4, 577.0], [36.5, 579.0], [36.6, 581.0], [36.7, 583.0], [36.8, 585.0], [36.9, 588.0], [37.0, 590.0], [37.1, 592.0], [37.2, 594.0], [37.3, 596.0], [37.4, 598.0], [37.5, 600.0], [37.6, 601.0], [37.7, 604.0], [37.8, 606.0], [37.9, 608.0], [38.0, 610.0], [38.1, 612.0], [38.2, 614.0], [38.3, 616.0], [38.4, 618.0], [38.5, 620.0], [38.6, 622.0], [38.7, 625.0], [38.8, 627.0], [38.9, 629.0], [39.0, 630.0], [39.1, 632.0], [39.2, 634.0], [39.3, 636.0], [39.4, 638.0], [39.5, 640.0], [39.6, 642.0], [39.7, 644.0], [39.8, 646.0], [39.9, 648.0], [40.0, 650.0], [40.1, 652.0], [40.2, 654.0], [40.3, 656.0], [40.4, 659.0], [40.5, 661.0], [40.6, 663.0], [40.7, 665.0], [40.8, 667.0], [40.9, 669.0], [41.0, 671.0], [41.1, 673.0], [41.2, 675.0], [41.3, 676.0], [41.4, 679.0], [41.5, 681.0], [41.6, 683.0], [41.7, 685.0], [41.8, 687.0], [41.9, 689.0], [42.0, 691.0], [42.1, 693.0], [42.2, 695.0], [42.3, 697.0], [42.4, 700.0], [42.5, 702.0], [42.6, 703.0], [42.7, 706.0], [42.8, 708.0], [42.9, 710.0], [43.0, 712.0], [43.1, 713.0], [43.2, 715.0], [43.3, 717.0], [43.4, 719.0], [43.5, 721.0], [43.6, 723.0], [43.7, 725.0], [43.8, 728.0], [43.9, 729.0], [44.0, 731.0], [44.1, 733.0], [44.2, 736.0], [44.3, 738.0], [44.4, 740.0], [44.5, 741.0], [44.6, 743.0], [44.7, 745.0], [44.8, 747.0], [44.9, 749.0], [45.0, 751.0], [45.1, 752.0], [45.2, 754.0], [45.3, 756.0], [45.4, 758.0], [45.5, 760.0], [45.6, 762.0], [45.7, 764.0], [45.8, 766.0], [45.9, 768.0], [46.0, 770.0], [46.1, 772.0], [46.2, 774.0], [46.3, 776.0], [46.4, 778.0], [46.5, 780.0], [46.6, 782.0], [46.7, 785.0], [46.8, 787.0], [46.9, 790.0], [47.0, 792.0], [47.1, 793.0], [47.2, 796.0], [47.3, 798.0], [47.4, 800.0], [47.5, 802.0], [47.6, 804.0], [47.7, 806.0], [47.8, 808.0], [47.9, 810.0], [48.0, 813.0], [48.1, 815.0], [48.2, 817.0], [48.3, 819.0], [48.4, 821.0], [48.5, 823.0], [48.6, 825.0], [48.7, 827.0], [48.8, 829.0], [48.9, 831.0], [49.0, 834.0], [49.1, 836.0], [49.2, 839.0], [49.3, 841.0], [49.4, 843.0], [49.5, 846.0], [49.6, 848.0], [49.7, 851.0], [49.8, 853.0], [49.9, 855.0], [50.0, 858.0], [50.1, 860.0], [50.2, 862.0], [50.3, 865.0], [50.4, 868.0], [50.5, 870.0], [50.6, 873.0], [50.7, 876.0], [50.8, 878.0], [50.9, 881.0], [51.0, 884.0], [51.1, 887.0], [51.2, 890.0], [51.3, 892.0], [51.4, 894.0], [51.5, 897.0], [51.6, 899.0], [51.7, 902.0], [51.8, 905.0], [51.9, 908.0], [52.0, 910.0], [52.1, 913.0], [52.2, 917.0], [52.3, 919.0], [52.4, 922.0], [52.5, 925.0], [52.6, 928.0], [52.7, 931.0], [52.8, 934.0], [52.9, 937.0], [53.0, 940.0], [53.1, 942.0], [53.2, 945.0], [53.3, 947.0], [53.4, 950.0], [53.5, 953.0], [53.6, 957.0], [53.7, 960.0], [53.8, 962.0], [53.9, 965.0], [54.0, 968.0], [54.1, 971.0], [54.2, 975.0], [54.3, 978.0], [54.4, 980.0], [54.5, 983.0], [54.6, 986.0], [54.7, 988.0], [54.8, 992.0], [54.9, 994.0], [55.0, 997.0], [55.1, 1000.0], [55.2, 1003.0], [55.3, 1006.0], [55.4, 1009.0], [55.5, 1012.0], [55.6, 1015.0], [55.7, 1018.0], [55.8, 1021.0], [55.9, 1024.0], [56.0, 1027.0], [56.1, 1030.0], [56.2, 1032.0], [56.3, 1035.0], [56.4, 1038.0], [56.5, 1040.0], [56.6, 1043.0], [56.7, 1046.0], [56.8, 1049.0], [56.9, 1052.0], [57.0, 1055.0], [57.1, 1058.0], [57.2, 1061.0], [57.3, 1063.0], [57.4, 1067.0], [57.5, 1070.0], [57.6, 1072.0], [57.7, 1076.0], [57.8, 1079.0], [57.9, 1082.0], [58.0, 1085.0], [58.1, 1087.0], [58.2, 1091.0], [58.3, 1094.0], [58.4, 1096.0], [58.5, 1099.0], [58.6, 1101.0], [58.7, 1104.0], [58.8, 1107.0], [58.9, 1110.0], [59.0, 1113.0], [59.1, 1116.0], [59.2, 1119.0], [59.3, 1122.0], [59.4, 1124.0], [59.5, 1128.0], [59.6, 1131.0], [59.7, 1133.0], [59.8, 1136.0], [59.9, 1139.0], [60.0, 1142.0], [60.1, 1145.0], [60.2, 1148.0], [60.3, 1151.0], [60.4, 1154.0], [60.5, 1158.0], [60.6, 1161.0], [60.7, 1164.0], [60.8, 1167.0], [60.9, 1170.0], [61.0, 1173.0], [61.1, 1176.0], [61.2, 1179.0], [61.3, 1182.0], [61.4, 1185.0], [61.5, 1188.0], [61.6, 1191.0], [61.7, 1194.0], [61.8, 1197.0], [61.9, 1200.0], [62.0, 1202.0], [62.1, 1205.0], [62.2, 1208.0], [62.3, 1211.0], [62.4, 1214.0], [62.5, 1217.0], [62.6, 1220.0], [62.7, 1224.0], [62.8, 1227.0], [62.9, 1230.0], [63.0, 1233.0], [63.1, 1236.0], [63.2, 1239.0], [63.3, 1243.0], [63.4, 1246.0], [63.5, 1249.0], [63.6, 1252.0], [63.7, 1256.0], [63.8, 1258.0], [63.9, 1261.0], [64.0, 1265.0], [64.1, 1268.0], [64.2, 1271.0], [64.3, 1274.0], [64.4, 1277.0], [64.5, 1280.0], [64.6, 1283.0], [64.7, 1286.0], [64.8, 1289.0], [64.9, 1292.0], [65.0, 1295.0], [65.1, 1298.0], [65.2, 1300.0], [65.3, 1302.0], [65.4, 1305.0], [65.5, 1308.0], [65.6, 1311.0], [65.7, 1314.0], [65.8, 1317.0], [65.9, 1320.0], [66.0, 1324.0], [66.1, 1326.0], [66.2, 1329.0], [66.3, 1332.0], [66.4, 1335.0], [66.5, 1338.0], [66.6, 1341.0], [66.7, 1344.0], [66.8, 1348.0], [66.9, 1350.0], [67.0, 1353.0], [67.1, 1355.0], [67.2, 1358.0], [67.3, 1361.0], [67.4, 1364.0], [67.5, 1367.0], [67.6, 1370.0], [67.7, 1373.0], [67.8, 1376.0], [67.9, 1379.0], [68.0, 1383.0], [68.1, 1385.0], [68.2, 1388.0], [68.3, 1391.0], [68.4, 1394.0], [68.5, 1397.0], [68.6, 1401.0], [68.7, 1404.0], [68.8, 1407.0], [68.9, 1409.0], [69.0, 1413.0], [69.1, 1416.0], [69.2, 1418.0], [69.3, 1422.0], [69.4, 1424.0], [69.5, 1427.0], [69.6, 1431.0], [69.7, 1433.0], [69.8, 1437.0], [69.9, 1440.0], [70.0, 1443.0], [70.1, 1446.0], [70.2, 1448.0], [70.3, 1451.0], [70.4, 1454.0], [70.5, 1457.0], [70.6, 1460.0], [70.7, 1462.0], [70.8, 1465.0], [70.9, 1468.0], [71.0, 1471.0], [71.1, 1474.0], [71.2, 1477.0], [71.3, 1479.0], [71.4, 1482.0], [71.5, 1485.0], [71.6, 1488.0], [71.7, 1492.0], [71.8, 1494.0], [71.9, 1497.0], [72.0, 1500.0], [72.1, 1503.0], [72.2, 1507.0], [72.3, 1509.0], [72.4, 1512.0], [72.5, 1515.0], [72.6, 1518.0], [72.7, 1521.0], [72.8, 1524.0], [72.9, 1527.0], [73.0, 1530.0], [73.1, 1534.0], [73.2, 1537.0], [73.3, 1539.0], [73.4, 1542.0], [73.5, 1545.0], [73.6, 1548.0], [73.7, 1550.0], [73.8, 1553.0], [73.9, 1556.0], [74.0, 1559.0], [74.1, 1562.0], [74.2, 1565.0], [74.3, 1568.0], [74.4, 1571.0], [74.5, 1574.0], [74.6, 1577.0], [74.7, 1580.0], [74.8, 1583.0], [74.9, 1586.0], [75.0, 1589.0], [75.1, 1592.0], [75.2, 1595.0], [75.3, 1598.0], [75.4, 1601.0], [75.5, 1604.0], [75.6, 1608.0], [75.7, 1610.0], [75.8, 1613.0], [75.9, 1616.0], [76.0, 1620.0], [76.1, 1622.0], [76.2, 1625.0], [76.3, 1628.0], [76.4, 1632.0], [76.5, 1634.0], [76.6, 1637.0], [76.7, 1640.0], [76.8, 1643.0], [76.9, 1646.0], [77.0, 1649.0], [77.1, 1652.0], [77.2, 1655.0], [77.3, 1658.0], [77.4, 1661.0], [77.5, 1664.0], [77.6, 1667.0], [77.7, 1670.0], [77.8, 1673.0], [77.9, 1676.0], [78.0, 1679.0], [78.1, 1681.0], [78.2, 1684.0], [78.3, 1687.0], [78.4, 1690.0], [78.5, 1693.0], [78.6, 1696.0], [78.7, 1699.0], [78.8, 1703.0], [78.9, 1706.0], [79.0, 1709.0], [79.1, 1712.0], [79.2, 1715.0], [79.3, 1718.0], [79.4, 1722.0], [79.5, 1725.0], [79.6, 1727.0], [79.7, 1731.0], [79.8, 1734.0], [79.9, 1737.0], [80.0, 1740.0], [80.1, 1743.0], [80.2, 1747.0], [80.3, 1750.0], [80.4, 1753.0], [80.5, 1756.0], [80.6, 1759.0], [80.7, 1763.0], [80.8, 1767.0], [80.9, 1769.0], [81.0, 1773.0], [81.1, 1777.0], [81.2, 1779.0], [81.3, 1783.0], [81.4, 1786.0], [81.5, 1790.0], [81.6, 1793.0], [81.7, 1796.0], [81.8, 1800.0], [81.9, 1803.0], [82.0, 1807.0], [82.1, 1810.0], [82.2, 1814.0], [82.3, 1818.0], [82.4, 1822.0], [82.5, 1825.0], [82.6, 1829.0], [82.7, 1832.0], [82.8, 1835.0], [82.9, 1839.0], [83.0, 1842.0], [83.1, 1847.0], [83.2, 1850.0], [83.3, 1854.0], [83.4, 1857.0], [83.5, 1861.0], [83.6, 1865.0], [83.7, 1869.0], [83.8, 1873.0], [83.9, 1877.0], [84.0, 1881.0], [84.1, 1885.0], [84.2, 1889.0], [84.3, 1893.0], [84.4, 1898.0], [84.5, 1901.0], [84.6, 1906.0], [84.7, 1910.0], [84.8, 1913.0], [84.9, 1917.0], [85.0, 1922.0], [85.1, 1926.0], [85.2, 1930.0], [85.3, 1934.0], [85.4, 1938.0], [85.5, 1942.0], [85.6, 1946.0], [85.7, 1950.0], [85.8, 1954.0], [85.9, 1958.0], [86.0, 1962.0], [86.1, 1966.0], [86.2, 1970.0], [86.3, 1973.0], [86.4, 1978.0], [86.5, 1982.0], [86.6, 1986.0], [86.7, 1990.0], [86.8, 1994.0], [86.9, 1998.0], [87.0, 2002.0], [87.1, 2007.0], [87.2, 2011.0], [87.3, 2016.0], [87.4, 2021.0], [87.5, 2025.0], [87.6, 2030.0], [87.7, 2035.0], [87.8, 2040.0], [87.9, 2044.0], [88.0, 2049.0], [88.1, 2053.0], [88.2, 2057.0], [88.3, 2063.0], [88.4, 2067.0], [88.5, 2072.0], [88.6, 2077.0], [88.7, 2081.0], [88.8, 2086.0], [88.9, 2090.0], [89.0, 2095.0], [89.1, 2100.0], [89.2, 2105.0], [89.3, 2110.0], [89.4, 2115.0], [89.5, 2120.0], [89.6, 2125.0], [89.7, 2131.0], [89.8, 2137.0], [89.9, 2142.0], [90.0, 2147.0], [90.1, 2152.0], [90.2, 2157.0], [90.3, 2163.0], [90.4, 2167.0], [90.5, 2173.0], [90.6, 2178.0], [90.7, 2184.0], [90.8, 2189.0], [90.9, 2194.0], [91.0, 2200.0], [91.1, 2205.0], [91.2, 2210.0], [91.3, 2216.0], [91.4, 2222.0], [91.5, 2227.0], [91.6, 2233.0], [91.7, 2240.0], [91.8, 2245.0], [91.9, 2251.0], [92.0, 2258.0], [92.1, 2264.0], [92.2, 2269.0], [92.3, 2275.0], [92.4, 2281.0], [92.5, 2287.0], [92.6, 2294.0], [92.7, 2302.0], [92.8, 2307.0], [92.9, 2314.0], [93.0, 2320.0], [93.1, 2326.0], [93.2, 2333.0], [93.3, 2339.0], [93.4, 2346.0], [93.5, 2353.0], [93.6, 2361.0], [93.7, 2367.0], [93.8, 2374.0], [93.9, 2380.0], [94.0, 2386.0], [94.1, 2393.0], [94.2, 2401.0], [94.3, 2407.0], [94.4, 2416.0], [94.5, 2423.0], [94.6, 2431.0], [94.7, 2438.0], [94.8, 2446.0], [94.9, 2454.0], [95.0, 2463.0], [95.1, 2472.0], [95.2, 2479.0], [95.3, 2488.0], [95.4, 2498.0], [95.5, 2508.0], [95.6, 2519.0], [95.7, 2527.0], [95.8, 2537.0], [95.9, 2550.0], [96.0, 2560.0], [96.1, 2570.0], [96.2, 2581.0], [96.3, 2591.0], [96.4, 2603.0], [96.5, 2615.0], [96.6, 2628.0], [96.7, 2639.0], [96.8, 2652.0], [96.9, 2665.0], [97.0, 2678.0], [97.1, 2691.0], [97.2, 2703.0], [97.3, 2719.0], [97.4, 2735.0], [97.5, 2753.0], [97.6, 2771.0], [97.7, 2789.0], [97.8, 2806.0], [97.9, 2825.0], [98.0, 2847.0], [98.1, 2868.0], [98.2, 2890.0], [98.3, 2910.0], [98.4, 2938.0], [98.5, 2960.0], [98.6, 2988.0], [98.7, 3014.0], [98.8, 3045.0], [98.9, 3080.0], [99.0, 3111.0], [99.1, 3145.0], [99.2, 3174.0], [99.3, 3221.0], [99.4, 3276.0], [99.5, 3344.0], [99.6, 3421.0], [99.7, 3517.0], [99.8, 3635.0], [99.9, 3835.0], [100.0, 5888.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 7692.0, "series": [{"data": [[0.0, 4377.0], [600.0, 5000.0], [700.0, 5087.0], [800.0, 4321.0], [900.0, 3549.0], [1000.0, 3504.0], [1100.0, 3433.0], [1200.0, 3358.0], [1300.0, 3447.0], [1400.0, 3477.0], [1500.0, 3449.0], [1600.0, 3419.0], [1700.0, 3134.0], [1800.0, 2723.0], [1900.0, 2531.0], [2000.0, 2193.0], [2100.0, 1951.0], [2300.0, 1550.0], [2200.0, 1705.0], [2400.0, 1257.0], [2500.0, 975.0], [2600.0, 806.0], [2800.0, 490.0], [2700.0, 612.0], [2900.0, 407.0], [3000.0, 322.0], [3100.0, 299.0], [3200.0, 180.0], [3300.0, 154.0], [3400.0, 109.0], [3500.0, 91.0], [3700.0, 36.0], [3600.0, 76.0], [3800.0, 28.0], [3900.0, 29.0], [4000.0, 18.0], [4300.0, 2.0], [4100.0, 10.0], [4200.0, 5.0], [4500.0, 1.0], [4400.0, 3.0], [4800.0, 2.0], [4700.0, 2.0], [4900.0, 3.0], [5000.0, 1.0], [5100.0, 2.0], [5200.0, 4.0], [5500.0, 1.0], [5800.0, 3.0], [100.0, 7071.0], [200.0, 7062.0], [300.0, 7692.0], [400.0, 6887.0], [500.0, 5149.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 5800.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 28544.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 40298.0, "series": [{"data": [[1.0, 40298.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 33155.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 28544.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 154.17137918261588, "minX": 1.54989096E12, "maxY": 1171.8492189171868, "series": [{"data": [[1.54989102E12, 594.6834506445085], [1.54989096E12, 154.17137918261588], [1.54989108E12, 1171.8492189171868]], "isOverall": false, "label": "bzm - Concurrency Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989108E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 139.0, "minX": 1.0, "maxY": 4404.0, "series": [{"data": [[2.0, 2210.0], [3.0, 2248.0], [4.0, 2192.0], [5.0, 2207.0], [6.0, 2224.0], [7.0, 2251.0], [8.0, 2201.0], [9.0, 2267.0], [10.0, 2233.0], [11.0, 2200.0], [12.0, 2271.0], [13.0, 2185.0], [14.0, 2252.0], [15.0, 2250.0], [16.0, 2931.0], [17.0, 2937.0], [18.0, 1990.0], [19.0, 3068.0], [20.0, 3063.0], [21.0, 3061.0], [22.0, 3083.0], [23.0, 3053.0], [24.0, 3072.0], [25.0, 3052.0], [27.0, 3039.0], [28.0, 1933.0], [29.0, 1624.0], [30.0, 1755.0], [31.0, 2562.0], [33.0, 2560.0], [32.0, 2034.0], [35.0, 2475.0], [34.0, 2540.0], [37.0, 2603.0], [36.0, 2249.0], [39.0, 1534.0], [38.0, 1926.0], [41.0, 2533.0], [40.0, 1764.0], [43.0, 1956.0], [42.0, 2598.0], [45.0, 2098.0], [44.0, 1521.0], [47.0, 1996.0], [49.0, 1529.0], [48.0, 1765.0], [51.0, 2098.0], [50.0, 1749.0], [53.0, 2588.0], [52.0, 2236.0], [54.0, 1640.0], [57.0, 2359.0], [56.0, 2186.0], [59.0, 2620.0], [58.0, 2031.0], [61.0, 1722.0], [60.0, 1516.0], [63.0, 2581.0], [62.0, 2592.0], [67.0, 2463.0], [66.0, 1908.0], [65.0, 2527.0], [64.0, 2550.0], [71.0, 1708.0], [70.0, 2436.0], [69.0, 1497.0], [68.0, 1664.0], [75.0, 2563.0], [74.0, 1707.0], [73.0, 1690.0], [72.0, 1987.0], [79.0, 1981.0], [78.0, 2568.0], [77.0, 2412.0], [76.0, 1552.0], [83.0, 2448.0], [82.0, 2555.0], [81.0, 1580.0], [80.0, 2087.0], [87.0, 1535.0], [86.0, 2555.0], [85.0, 1559.0], [84.0, 2500.0], [91.0, 1576.0], [90.0, 1693.0], [89.0, 1851.0], [88.0, 2449.0], [95.0, 1907.0], [94.0, 2186.0], [93.0, 1846.0], [92.0, 1639.0], [99.0, 2081.0], [98.0, 1588.0], [97.0, 2538.0], [96.0, 2410.0], [103.0, 1465.0], [102.0, 2045.0], [101.0, 1614.0], [100.0, 2377.0], [107.0, 1458.0], [106.0, 2389.0], [105.0, 2445.0], [104.0, 1461.0], [111.0, 2585.0], [110.0, 1850.0], [109.0, 1651.0], [108.0, 1479.0], [115.0, 1478.0], [114.0, 2277.0], [112.0, 2519.0], [119.0, 2377.0], [118.0, 2281.0], [117.0, 1663.0], [116.0, 2527.0], [123.0, 1538.0], [122.0, 1567.0], [121.0, 1654.0], [120.0, 1451.0], [124.0, 205.45040302681284], [125.0, 348.8571428571429], [127.0, 602.0], [126.0, 1996.0], [128.0, 588.3333333333333], [131.0, 983.0], [132.0, 844.0], [133.0, 792.0], [135.0, 1542.0], [134.0, 2509.0], [130.0, 2494.0], [129.0, 1560.0], [136.0, 814.0], [139.0, 406.0], [141.0, 393.66666666666663], [142.0, 260.0625], [143.0, 1589.0], [140.0, 1670.0], [138.0, 2622.0], [137.0, 1907.0], [144.0, 1104.0], [151.0, 2388.0], [150.0, 2641.0], [149.0, 1652.0], [148.0, 2002.0], [147.0, 1486.0], [146.0, 2505.5], [155.0, 1223.0], [159.0, 2599.0], [157.0, 1892.0], [156.0, 1930.0], [154.0, 1470.0], [152.0, 2265.0], [167.0, 2509.0], [165.0, 1992.0], [164.0, 1916.0], [163.0, 1640.0], [162.0, 2547.0], [161.0, 2485.0], [160.0, 2509.0], [173.0, 935.25], [175.0, 2485.0], [174.0, 1445.0], [171.0, 1522.0], [170.0, 1804.5], [168.0, 1853.0], [177.0, 638.0], [178.0, 837.6666666666666], [180.0, 859.0], [183.0, 1891.0], [182.0, 1535.0], [181.0, 1571.0], [179.0, 2488.0], [176.0, 2677.0], [189.0, 919.0], [191.0, 1535.0], [190.0, 1511.0], [188.0, 2346.0], [187.0, 1473.0], [186.0, 1418.0], [185.0, 1627.0], [184.0, 2120.0], [192.0, 644.6666666666667], [194.0, 1034.0], [198.0, 1049.5], [199.0, 1600.0], [197.0, 1567.0], [196.0, 1548.0], [195.0, 1506.0], [193.0, 1539.0], [201.0, 374.375], [202.0, 448.0], [203.0, 860.5], [204.0, 918.5], [207.0, 178.2], [206.0, 1907.0], [205.0, 1560.0], [200.0, 1940.0], [208.0, 927.0], [209.0, 991.6666666666666], [211.0, 1537.3333333333335], [212.0, 558.1428571428571], [215.0, 1477.0], [214.0, 1553.0], [213.0, 1594.0], [217.0, 1066.0], [219.0, 538.6666666666666], [222.0, 990.0], [223.0, 1045.6666666666665], [221.0, 2566.0], [220.0, 1599.0], [218.0, 1843.0], [216.0, 2537.0], [224.0, 511.25], [225.0, 790.5], [226.0, 409.83333333333337], [227.0, 705.0], [228.0, 905.0], [230.0, 736.0], [231.0, 949.0], [229.0, 2643.0], [232.0, 874.5], [237.0, 226.0], [238.0, 1662.0], [236.0, 1842.0], [235.0, 2635.0], [234.0, 1837.0], [233.0, 2220.0], [240.0, 1436.6666666666667], [241.0, 961.0], [242.0, 648.3333333333333], [245.0, 605.0], [247.0, 489.6], [246.0, 2619.0], [244.0, 1516.0], [243.0, 1928.0], [248.0, 334.22018473241036], [249.0, 976.0], [250.0, 1225.5], [251.0, 902.0], [252.0, 736.4], [253.0, 1269.0], [255.0, 1011.5], [254.0, 1930.0], [269.0, 1197.4], [256.0, 1148.6666666666665], [259.0, 805.0], [258.0, 2569.0], [257.0, 1367.0], [263.0, 806.0], [262.0, 1601.0], [261.0, 1996.0], [260.0, 1966.0], [264.0, 880.0], [267.0, 1317.2], [271.0, 1731.0], [270.0, 1377.0], [265.0, 2079.0], [286.0, 1866.0], [272.0, 960.6666666666667], [273.0, 687.75], [275.0, 2055.0], [274.0, 1858.0], [279.0, 418.0], [278.0, 1870.0], [277.0, 1473.0], [276.0, 1956.0], [281.0, 1157.5], [282.0, 667.3333333333333], [283.0, 1039.5], [287.0, 2562.0], [280.0, 2046.0], [285.0, 2116.0], [284.0, 2624.0], [300.0, 517.3333333333333], [295.0, 1037.5], [291.0, 590.0], [290.0, 1374.0], [289.0, 1344.0], [288.0, 1737.0], [293.0, 1131.0], [292.0, 1848.0], [294.0, 1830.0], [296.0, 1060.5], [297.0, 992.5], [298.0, 719.0], [299.0, 1564.0], [301.0, 665.3333333333334], [302.0, 1069.5], [303.0, 1108.0], [318.0, 1779.0], [305.0, 1707.25], [311.0, 1881.0], [310.0, 2090.0], [309.0, 1522.0], [308.0, 2186.0], [306.0, 926.5], [313.0, 820.0], [315.0, 1185.0], [319.0, 3087.0], [312.0, 1731.0], [317.0, 2402.0], [316.0, 1555.0], [307.0, 2305.0], [314.0, 1489.0], [334.0, 1864.0], [332.0, 862.5], [335.0, 1007.3333333333334], [333.0, 2130.0], [331.0, 2403.0], [330.0, 2380.0], [329.0, 2702.0], [328.0, 2482.0], [327.0, 1548.0], [321.0, 2287.0], [323.0, 2042.0], [322.0, 1328.0], [326.0, 1674.0], [325.0, 2449.0], [324.0, 2431.0], [350.0, 1696.0], [341.0, 584.6666666666667], [340.0, 2486.0], [342.0, 889.6666666666667], [343.0, 1426.5], [337.0, 1791.0], [336.0, 2439.0], [339.0, 1541.0], [338.0, 1326.0], [344.0, 1431.5], [347.0, 1494.5], [346.0, 1955.0], [345.0, 1542.0], [351.0, 2415.0], [349.0, 1889.0], [348.0, 2958.0], [365.0, 1750.0], [352.0, 1163.0], [358.0, 2622.0], [357.0, 1519.0], [356.0, 1370.0], [353.0, 1225.0], [360.0, 1645.6666666666665], [363.0, 763.1666666666666], [364.0, 1339.0], [355.0, 1853.0], [354.0, 2518.0], [366.0, 711.6666666666667], [367.0, 2473.0], [362.0, 2501.0], [382.0, 1491.0], [370.0, 499.8], [369.0, 840.5], [375.0, 1797.0], [368.0, 2387.0], [371.0, 911.5], [381.0, 2407.0], [380.0, 1948.0], [372.0, 466.0270338875495], [373.0, 2408.0], [374.0, 971.0], [377.0, 1577.0], [378.0, 970.0], [379.0, 2037.0], [383.0, 1625.0], [376.0, 2462.0], [396.0, 961.6666666666667], [384.0, 950.5], [387.0, 1116.5], [386.0, 2479.0], [385.0, 2633.0], [390.0, 675.0], [389.0, 2026.0], [391.0, 923.5], [392.0, 267.0], [393.0, 1348.0], [395.0, 1732.0], [394.0, 2595.0], [397.0, 734.5], [399.0, 1495.0], [398.0, 1669.0], [414.0, 1768.0], [409.0, 1427.5], [404.0, 1004.3333333333334], [407.0, 2422.0], [401.0, 2222.5], [403.0, 1841.0], [402.0, 1321.0], [405.0, 1610.0], [411.0, 723.3333333333333], [415.0, 1605.0], [413.0, 1796.0], [412.0, 2773.0], [410.0, 1603.0], [408.0, 1507.0], [430.0, 1466.0], [428.0, 825.0], [431.0, 1800.0], [429.0, 2430.0], [427.0, 1940.0], [426.0, 1951.0], [425.0, 1585.0], [424.0, 1593.0], [423.0, 1492.0], [417.0, 1856.0], [416.0, 1762.0], [419.0, 1710.0], [418.0, 2328.0], [422.0, 1456.0], [421.0, 2467.0], [420.0, 1422.0], [447.0, 2508.0], [437.0, 898.0], [436.0, 1467.0], [438.0, 2406.0], [439.0, 596.6666666666667], [440.0, 836.6666666666667], [441.0, 1450.0], [442.0, 1493.0], [443.0, 1256.5], [446.0, 1737.0], [445.0, 2054.0], [444.0, 1681.0], [435.0, 1584.0], [434.0, 2476.0], [433.0, 2700.0], [432.0, 1967.0], [461.0, 710.5], [451.0, 1229.5], [455.0, 2382.0], [450.0, 1827.5], [448.0, 2455.0], [454.0, 1679.0], [460.0, 1445.0], [452.0, 1135.0], [453.0, 565.5], [456.0, 1019.0], [457.0, 986.5], [458.0, 838.25], [459.0, 2382.0], [463.0, 1757.0], [462.0, 2442.0], [476.0, 767.0], [467.0, 1448.5], [471.0, 1873.0], [466.0, 2198.6666666666665], [468.0, 1007.5], [469.0, 2637.0], [470.0, 1030.3333333333333], [472.0, 1221.5], [473.0, 2991.0], [477.0, 1325.5], [479.0, 1810.0], [478.0, 1425.0], [475.0, 1793.0], [474.0, 2480.0], [480.0, 1678.0], [485.0, 962.0], [484.0, 1992.0], [486.0, 725.6666666666667], [487.0, 410.5], [489.0, 746.75], [490.0, 1160.0], [491.0, 1647.0], [493.0, 835.0], [492.0, 1640.0], [483.0, 2846.0], [482.0, 2945.0], [481.0, 2853.0], [495.0, 1811.0], [488.0, 1896.0], [494.0, 1929.0], [510.0, 1406.0], [496.0, 613.6317588957816], [501.0, 2053.5], [500.0, 1610.0], [503.0, 1992.5], [511.0, 2820.0], [509.0, 2351.0], [508.0, 1166.0], [499.0, 2966.0], [498.0, 1726.0], [497.0, 3111.0], [507.0, 2510.5], [505.0, 1185.0], [504.0, 2104.0], [538.0, 787.0], [515.0, 1140.0], [516.0, 1723.0], [519.0, 1600.0], [517.0, 1781.0], [522.0, 1067.0], [521.0, 1882.0], [520.0, 1755.0], [523.0, 1926.0], [525.0, 1687.0], [524.0, 1381.0], [527.0, 2931.0], [512.0, 1399.0], [514.0, 2359.0], [513.0, 1183.0], [526.0, 2801.0], [542.0, 1444.0], [543.0, 2095.0], [528.0, 2656.0], [530.0, 1165.0], [529.0, 2579.0], [532.0, 2397.0], [531.0, 2397.0], [535.0, 2663.0], [534.0, 2201.5], [540.0, 2587.0], [539.0, 1328.0], [537.0, 1451.0], [536.0, 1987.0], [568.0, 2270.0], [574.0, 1430.6666666666667], [570.0, 1200.75], [550.0, 1375.5], [549.0, 2306.0], [548.0, 1499.0], [547.0, 1983.0], [546.0, 1859.0], [545.0, 2367.0], [551.0, 2402.0], [559.0, 1764.0], [558.0, 2968.0], [557.0, 2783.0], [556.0, 1486.0], [555.0, 2378.0], [554.0, 2949.0], [553.0, 2453.0], [552.0, 1209.0], [575.0, 501.6666666666667], [561.0, 3062.0], [560.0, 1976.0], [563.0, 2829.0], [562.0, 1643.0], [565.0, 1756.0], [564.0, 1856.0], [572.0, 2479.0], [571.0, 1632.0], [569.0, 2555.0], [567.0, 1851.0], [566.0, 2637.0], [583.0, 1138.5], [589.0, 1095.5], [577.0, 861.0], [576.0, 1502.5], [578.0, 1265.0], [581.0, 1218.1428571428573], [582.0, 411.0], [593.0, 1043.6666666666667], [592.0, 1756.0], [596.0, 1586.0], [595.0, 2429.5], [600.0, 921.0], [601.0, 1906.0], [603.0, 2157.0], [602.0, 1406.0], [605.0, 1971.0], [604.0, 2281.0], [607.0, 1225.4], [597.0, 1342.5], [598.0, 1028.8888888888887], [599.0, 2207.3333333333335], [585.0, 1054.0], [584.0, 2162.5], [586.0, 1359.6666666666667], [588.0, 955.5], [587.0, 2868.0], [590.0, 1649.0], [591.0, 1246.3333333333333], [637.0, 1774.0], [614.0, 1078.0], [608.0, 1317.5], [611.0, 2470.0], [610.0, 2118.5], [613.0, 1958.0], [612.0, 2458.0], [615.0, 1251.0], [632.0, 2274.0], [620.0, 784.4903381642531], [619.0, 2029.0], [618.0, 1821.0], [617.0, 2718.0], [616.0, 2421.0], [621.0, 944.4], [622.0, 734.9487179487179], [623.0, 1010.6], [624.0, 767.7894736842106], [625.0, 1762.0], [627.0, 2614.0], [626.0, 2248.0], [629.0, 3086.0], [628.0, 1847.0], [631.0, 1518.0], [630.0, 1502.0], [638.0, 1233.0], [636.0, 1301.0], [635.0, 2467.0], [639.0, 1662.5], [633.0, 1345.6666666666665], [667.0, 1247.2500000000002], [645.0, 1454.5], [640.0, 2048.0], [642.0, 2325.0], [641.0, 2412.0], [644.0, 1916.0], [643.0, 1785.0], [646.0, 1124.0], [647.0, 1239.0], [649.0, 885.3333333333333], [648.0, 1824.0], [650.0, 1620.5], [651.0, 859.0], [652.0, 1282.0], [654.0, 1460.0], [653.0, 1746.0], [655.0, 1013.5], [657.0, 1723.0], [658.0, 1915.0], [671.0, 1380.0], [656.0, 2353.0], [668.0, 1062.4], [669.0, 2560.0], [670.0, 1293.0], [665.0, 1523.3333333333335], [664.0, 1780.0], [666.0, 1180.0], [659.0, 1094.0], [662.0, 2006.0], [661.0, 1228.0], [660.0, 1795.0], [663.0, 1462.5], [698.0, 1905.6666666666667], [675.0, 1670.5], [674.0, 2374.0], [673.0, 2829.0], [672.0, 1023.0], [676.0, 634.6], [677.0, 1365.6666666666667], [678.0, 2372.0], [696.0, 2636.0], [679.0, 2232.0], [680.0, 1743.0], [681.0, 1520.0], [683.0, 1197.0], [682.0, 2261.0], [685.0, 1378.0], [684.0, 2676.0], [686.0, 1408.0], [691.0, 1086.0], [692.0, 1330.5], [694.0, 1112.0], [693.0, 2259.0], [703.0, 2020.0], [688.0, 2749.0], [690.0, 2798.0], [689.0, 2912.0], [701.0, 2084.0], [700.0, 2895.0], [699.0, 1570.0], [729.0, 2282.0], [718.0, 1475.0], [709.0, 1602.5], [719.0, 2338.0], [704.0, 1564.0], [706.0, 2234.0], [705.0, 1627.0], [708.0, 1668.0], [707.0, 1599.0], [728.0, 1934.0], [711.0, 1464.0], [710.0, 1728.0], [730.0, 1754.0], [732.0, 2443.0], [731.0, 1877.0], [733.0, 500.625], [735.0, 1145.3333333333335], [721.0, 2296.0], [720.0, 2598.0], [734.0, 2179.5], [713.0, 1202.0], [712.0, 2689.0], [715.0, 3057.0], [714.0, 1560.0], [716.0, 1127.5], [717.0, 794.0], [723.0, 1231.0], [724.0, 245.0], [725.0, 1085.3333333333333], [727.0, 956.5], [726.0, 1550.0], [761.0, 1085.0], [743.0, 1122.0], [751.0, 925.0], [742.0, 1158.0], [741.0, 2792.0], [740.0, 1855.0], [739.0, 1935.0], [738.0, 2302.0], [737.0, 2641.0], [736.0, 1879.0], [750.0, 1127.0], [760.0, 2235.0], [744.0, 914.0690512360192], [745.0, 2373.0], [748.0, 2194.5], [746.0, 2559.0], [749.0, 1437.5], [755.0, 1435.0], [757.0, 495.8], [756.0, 2349.0], [759.0, 1311.6666666666667], [758.0, 1779.0], [762.0, 1116.0], [763.0, 1345.6666666666667], [767.0, 1268.5], [752.0, 2288.0], [754.0, 1747.0], [753.0, 2058.0], [766.0, 2112.0], [765.0, 1698.0], [764.0, 2544.0], [775.0, 1415.0], [782.0, 1499.0], [768.0, 998.6666666666667], [771.0, 2159.0], [770.0, 2636.0], [769.0, 2181.0], [772.0, 1029.0], [773.0, 771.5], [774.0, 1731.0], [784.0, 856.0], [799.0, 2510.0], [797.0, 1541.5], [796.0, 1242.0], [795.0, 2519.0], [794.0, 2027.0], [798.0, 1369.3333333333333], [792.0, 1561.5], [793.0, 1160.0], [785.0, 1112.0], [786.0, 1219.0], [787.0, 1701.0], [788.0, 1723.5], [789.0, 2052.5], [790.0, 1097.5], [791.0, 930.6], [777.0, 1483.0], [776.0, 1757.0], [778.0, 1709.0], [779.0, 1308.5], [780.0, 1255.6666666666665], [781.0, 2173.0], [783.0, 1621.5], [824.0, 1206.3333333333335], [813.0, 746.7777777777778], [800.0, 1072.0], [801.0, 2174.0], [803.0, 2302.0], [802.0, 912.0], [804.0, 1775.0], [805.0, 1536.5], [807.0, 1509.0], [806.0, 2802.0], [825.0, 793.0], [826.0, 2797.0], [827.0, 1973.3333333333333], [828.0, 1802.5], [829.0, 1733.5], [831.0, 2647.0], [830.0, 2286.0], [809.0, 1329.6666666666665], [808.0, 2168.0], [810.0, 2237.0], [811.0, 869.3333333333334], [812.0, 1090.0], [815.0, 1737.5], [814.0, 1776.0], [816.0, 1185.5], [819.0, 1422.0], [818.0, 1302.0], [817.0, 1805.0], [821.0, 1921.0], [820.0, 2658.0], [822.0, 1437.6666666666665], [823.0, 1121.0], [856.0, 1213.0], [835.0, 1453.5], [836.0, 919.75], [839.0, 2431.0], [837.0, 2577.0], [842.0, 1165.0], [841.0, 2762.0], [840.0, 1459.0], [844.0, 1474.0], [843.0, 1798.0], [847.0, 1316.5], [832.0, 1802.0], [834.0, 2519.0], [833.0, 2773.0], [845.0, 1679.0], [855.0, 1529.0], [854.0, 1790.0], [853.0, 1498.0], [852.0, 1088.0], [851.0, 2510.0], [850.0, 2486.0], [849.0, 1698.0], [848.0, 2356.0], [857.0, 1051.3333333333335], [858.0, 1778.0], [859.0, 1166.5], [863.0, 1919.5], [862.0, 2291.0], [861.0, 2025.0], [889.0, 1623.0], [865.0, 445.0], [864.0, 1842.0], [867.0, 1848.5], [868.0, 1070.7102960102943], [888.0, 2360.0], [870.0, 2536.0], [878.0, 1792.5], [877.0, 2116.0], [876.0, 1889.5], [874.0, 1982.0], [873.0, 1970.4], [879.0, 1620.0], [882.0, 1774.6666666666667], [880.0, 1631.0], [885.0, 2294.0], [884.0, 1553.5], [887.0, 785.0], [886.0, 1761.0], [894.0, 1582.0], [895.0, 2113.0], [893.0, 793.0], [892.0, 1500.0], [891.0, 2135.0], [890.0, 397.0], [901.0, 1265.5], [897.0, 1416.3333333333333], [896.0, 401.0], [898.0, 1345.4], [900.0, 1726.0], [899.0, 848.0], [909.0, 1231.6666666666667], [907.0, 1142.0], [906.0, 1621.0], [905.0, 410.0], [904.0, 751.0], [911.0, 1183.5], [916.0, 1130.0], [915.0, 2106.0], [914.0, 2083.0], [913.0, 1484.0], [912.0, 2328.0], [917.0, 631.0], [919.0, 2030.0], [918.0, 2149.0], [926.0, 1947.0], [927.0, 1044.0], [925.0, 1201.0], [924.0, 1194.0], [923.0, 1899.5], [921.0, 1209.5], [903.0, 1477.0], [902.0, 1697.0], [954.0, 2106.0], [958.0, 776.5], [931.0, 729.5], [932.0, 1003.3333333333333], [933.0, 1385.0], [935.0, 1606.0], [934.0, 1568.0], [953.0, 1371.0], [952.0, 589.0], [955.0, 2138.0], [943.0, 1440.3333333333333], [928.0, 2293.0], [930.0, 728.0], [929.0, 2017.0], [942.0, 1380.0], [940.0, 1989.0], [939.0, 1901.0], [938.0, 2252.0], [937.0, 1999.0], [936.0, 2233.0], [947.0, 862.6666666666666], [950.0, 1300.0], [949.0, 1609.0], [948.0, 2013.0], [951.0, 1316.5], [959.0, 2051.0], [944.0, 2133.0], [946.0, 423.0], [945.0, 2402.0], [957.0, 387.0], [956.0, 760.0], [985.0, 666.0], [989.0, 2009.0], [965.0, 1867.5], [966.0, 974.5], [984.0, 2565.0], [967.0, 1985.0], [986.0, 425.0], [970.0, 1777.0], [969.0, 1123.5], [972.0, 2100.0], [971.0, 323.0], [975.0, 1192.0], [960.0, 1102.0], [962.0, 487.0], [961.0, 1474.0], [964.0, 351.0], [963.0, 1275.0], [974.0, 1258.0], [983.0, 876.0], [982.0, 2204.0], [981.0, 944.0], [980.0, 1254.0], [978.0, 1520.0], [977.0, 2369.0], [976.0, 669.0], [991.0, 1897.0], [990.0, 323.0], [988.0, 664.0], [987.0, 1109.0], [1020.0, 2399.0], [992.0, 1185.4233973198097], [994.0, 2027.0], [993.0, 353.0], [996.0, 1673.0], [995.0, 1764.0], [998.0, 1629.0], [997.0, 2006.0], [1007.0, 332.0], [1006.0, 1928.0], [1005.0, 499.0], [1004.0, 2004.0], [1003.0, 2360.0], [1002.0, 1717.0], [1001.0, 1495.0], [1000.0, 1846.5], [1023.0, 1770.0], [1009.0, 1058.0], [1008.0, 361.0], [1011.0, 1636.0], [1010.0, 1668.0], [1013.0, 906.0], [1012.0, 1709.0], [1015.0, 1492.0], [1014.0, 1652.0], [1022.0, 959.0], [1021.0, 1615.0], [1019.0, 2694.0], [1018.0, 1469.0], [1017.0, 1183.0], [1016.0, 2007.0], [1084.0, 1359.0], [1056.0, 2660.0], [1058.0, 2128.0], [1060.0, 2049.0], [1062.0, 1329.0], [1064.0, 916.0], [1066.0, 564.0], [1068.0, 835.0], [1070.0, 1554.0], [1086.0, 1846.0], [1082.0, 581.0], [1080.0, 1547.0], [1078.0, 2133.0], [1076.0, 2069.0], [1074.0, 1045.0], [1072.0, 2297.0], [1026.0, 231.0], [1028.0, 1096.0], [1030.0, 1900.0], [1032.0, 1609.0], [1034.0, 2385.0], [1036.0, 1252.0], [1038.0, 1854.0], [1054.0, 1111.0], [1052.0, 2999.0], [1050.0, 931.0], [1046.0, 1598.0], [1044.0, 1824.0], [1042.0, 986.0], [1040.0, 1654.0], [1102.0, 306.0], [1122.0, 1065.0], [1116.0, 1380.6898101898166], [1114.0, 313.0], [1112.0, 2275.5], [1110.0, 594.0], [1108.0, 569.0], [1106.0, 649.0], [1104.0, 1833.0], [1120.0, 1396.0], [1150.0, 2713.5], [1148.0, 2305.0], [1140.0, 2357.0], [1144.0, 2063.0], [1142.0, 1636.5], [1146.0, 2269.0], [1138.0, 1400.0], [1100.0, 2322.0], [1098.0, 1902.0], [1096.0, 476.0], [1094.0, 2089.0], [1092.0, 2690.0], [1090.0, 2335.0], [1088.0, 618.0], [1118.0, 2080.0], [1124.0, 1655.8], [1126.0, 534.0], [1132.0, 1002.8], [1130.0, 773.0], [1134.0, 1536.0], [1166.0, 2088.0], [1178.0, 1354.1666666666667], [1154.0, 1921.3333333333335], [1152.0, 2093.0], [1180.0, 503.0], [1182.0, 2207.5], [1158.0, 1170.5], [1156.0, 1967.0], [1162.0, 2275.5], [1160.0, 2589.0], [1204.0, 2987.0], [1206.0, 2423.0], [1208.0, 2458.5], [1210.0, 1990.0], [1184.0, 2107.0], [1214.0, 2040.0], [1212.0, 2985.5], [1186.0, 948.0], [1198.0, 1522.0], [1196.0, 1252.0], [1194.0, 2212.5], [1192.0, 1866.0], [1168.0, 1532.0], [1170.0, 2031.0], [1172.0, 1557.5], [1176.0, 1784.0], [1216.0, 2954.0], [1238.0, 1921.3333333333333], [1222.0, 1264.0], [1220.0, 718.0], [1218.0, 1935.5], [1240.0, 1559.786171857745], [1236.0, 2561.0], [1234.0, 2182.0], [1081.0, 538.0], [1075.0, 4404.0], [1087.0, 1349.0], [1057.0, 1676.0], [1059.0, 2533.0], [1061.0, 2079.0], [1063.0, 4003.0], [1065.0, 2030.0], [1067.0, 567.0], [1069.0, 2998.0], [1071.0, 2443.0], [1085.0, 631.0], [1079.0, 986.0], [1077.0, 1107.0], [1055.0, 2267.0], [1025.0, 1757.5], [1027.0, 2087.0], [1029.0, 1135.0], [1031.0, 1417.0], [1033.0, 1678.0], [1035.0, 808.0], [1037.0, 1952.0], [1039.0, 2012.0], [1053.0, 1437.0], [1051.0, 3762.0], [1049.0, 2175.5], [1047.0, 2322.0], [1045.0, 2157.0], [1043.0, 1076.0], [1041.0, 1953.0], [1099.0, 1101.0], [1147.0, 1785.5], [1115.0, 2236.0], [1113.0, 2097.0], [1109.0, 1854.0], [1107.0, 1271.0], [1105.0, 2040.0], [1117.0, 2037.6666666666665], [1121.0, 408.5], [1149.0, 2069.0], [1141.0, 1619.5], [1145.0, 1538.5], [1137.0, 1783.0], [1119.0, 2301.0], [1103.0, 603.0], [1101.0, 2318.0], [1097.0, 691.0], [1095.0, 2025.0], [1093.0, 1449.0], [1091.0, 351.0], [1089.0, 2269.0], [1139.0, 1506.142857142857], [1123.0, 2221.5], [1125.0, 1758.0], [1127.0, 1367.5], [1129.0, 1948.0], [1131.0, 1049.0], [1133.0, 2324.0], [1135.0, 1399.0], [1201.0, 1133.6666666666665], [1159.0, 1253.0], [1155.0, 1575.0], [1153.0, 2053.0], [1179.0, 517.0], [1181.0, 1647.0], [1157.0, 2351.0], [1165.0, 2397.0], [1163.0, 2414.0], [1161.0, 2281.0], [1203.0, 2183.0], [1209.0, 2239.0], [1215.0, 1247.0], [1185.0, 1769.0], [1211.0, 2170.5], [1197.0, 1445.0], [1195.0, 2277.0], [1191.0, 1401.0], [1189.0, 2001.0], [1187.0, 920.0], [1199.0, 2408.0], [1169.0, 2309.5], [1171.0, 1034.0], [1173.0, 1780.0], [1175.0, 1478.75], [1177.0, 1368.0], [1223.0, 248.0], [1225.0, 1310.0], [1221.0, 715.0], [1219.0, 139.0], [1235.0, 1714.0], [1239.0, 1550.0], [1233.0, 2057.0], [1229.0, 1733.0], [1.0, 2240.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[824.1037579536658, 1043.712471935445]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1240.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 20112.516666666666, "minX": 1.54989096E12, "maxY": 383562.11666666664, "series": [{"data": [[1.54989102E12, 383562.11666666664], [1.54989096E12, 65711.75], [1.54989108E12, 380056.48333333334]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54989102E12, 117133.86666666667], [1.54989096E12, 20112.516666666666], [1.54989108E12, 116046.16666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989108E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 229.27694777132893, "minX": 1.54989096E12, "maxY": 1495.7635566017589, "series": [{"data": [[1.54989102E12, 735.7020861601111], [1.54989096E12, 229.27694777132893], [1.54989108E12, 1495.7635566017589]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54989108E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 229.2732436103224, "minX": 1.54989096E12, "maxY": 1495.7622512304783, "series": [{"data": [[1.54989102E12, 735.699669267303], [1.54989096E12, 229.2732436103224], [1.54989108E12, 1495.7622512304783]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54989108E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 0.6163723916532903, "minX": 1.54989096E12, "maxY": 9.872309009201743, "series": [{"data": [[1.54989102E12, 1.6390773405698655], [1.54989096E12, 0.6163723916532903], [1.54989108E12, 9.872309009201743]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54989108E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 7.0, "minX": 1.54989096E12, "maxY": 5888.0, "series": [{"data": [[1.54989102E12, 4312.0], [1.54989096E12, 1852.0], [1.54989108E12, 5888.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54989102E12, 8.0], [1.54989096E12, 10.0], [1.54989108E12, 7.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54989102E12, 1773.0], [1.54989096E12, 391.0], [1.54989108E12, 2556.9000000000015]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54989102E12, 2565.9900000000016], [1.54989096E12, 1192.0], [1.54989108E12, 3463.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54989102E12, 2060.9000000000015], [1.54989096E12, 546.0], [1.54989108E12, 2855.9500000000007]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989108E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 186.0, "minX": 134.0, "maxY": 1624.0, "series": [{"data": [[134.0, 186.0], [786.0, 914.5], [778.0, 1624.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 786.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 186.0, "minX": 134.0, "maxY": 1624.0, "series": [{"data": [[134.0, 186.0], [786.0, 914.5], [778.0, 1624.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 786.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 139.11666666666667, "minX": 1.54989096E12, "maxY": 798.5333333333333, "series": [{"data": [[1.54989102E12, 798.5333333333333], [1.54989096E12, 139.11666666666667], [1.54989108E12, 762.3]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989108E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 134.98333333333332, "minX": 1.54989096E12, "maxY": 786.1333333333333, "series": [{"data": [[1.54989102E12, 786.1333333333333], [1.54989096E12, 134.98333333333332], [1.54989108E12, 778.8333333333334]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54989108E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 134.98333333333332, "minX": 1.54989096E12, "maxY": 786.1333333333333, "series": [{"data": [[1.54989102E12, 786.1333333333333], [1.54989096E12, 134.98333333333332], [1.54989108E12, 778.8333333333334]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54989108E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
